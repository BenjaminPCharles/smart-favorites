import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { consumeChallenge, issueChallenge } from '../helpers/auth-challenge.helper'
import { accountCreateMessage, deviceRegisterMessage, sessionMessage } from '../helpers/auth-message.helper'
import { isUniqueViolation } from '../helpers/pg-error.helper'
import { generateSessionToken, hashSessionToken, SESSION_TTL_SECONDS } from '../helpers/session-token.helper'
import { verifyDeviceSignature, verifyMasterSignature } from '../helpers/signature.helper'
import {
  authChallengeBodySchema,
  authDeviceBodySchema,
  authInitBodySchema,
  authSessionBodySchema,
} from '../schemas/auth.schema'

/**
 * Two rules here: never pass `request.body` to `request.log.*`, never return zod
 * issues. Both echo request content, see the `redact` config in index.ts.
 */

/** Shape errors only depend on the request bytes, so they give nothing away. */
const INVALID_REQUEST = { message: 'Invalid request' }
/**
 * Anything depending on a database row gets this: bad signature, spent nonce,
 * revoked device, unknown account. Telling them apart is an enumeration oracle.
 */
const UNAUTHORIZED = { message: 'Unauthorized' }

/** Soft cap, so one stolen mnemonic can't enroll devices forever. */
const MAX_ACTIVE_DEVICES = 20

export function authRoutes(fastify: FastifyInstance): void {
  /**
   * Create an account from a master public key plus a first device key. The master
   * signature is the auth, nobody but the key holder reaches the insert. No session
   * comes back, so only /auth/session ever mints one.
   */
  fastify.post('/auth/init', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 hour',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = authInitBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(INVALID_REQUEST)
    }

    const { masterPublicKey, devicePublicKey, signature, label } = parsed.data
    if (!verifyMasterSignature(masterPublicKey, accountCreateMessage(masterPublicKey, devicePublicKey), signature)) {
      return reply.code(401).send(UNAUTHORIZED)
    }

    try {
      // One statement, so user + first device are atomic without an explicit tx
      const result = await fastify.db.query<{ public_id: string, device_uuid: string }>(
        `WITH created_user AS (
           INSERT INTO "user" (master_public_key) VALUES ($1)
           RETURNING id, public_id
         ),
         created_device AS (
           INSERT INTO user_device (user_id, public_key, label)
           SELECT id, $2, $3 FROM created_user
           RETURNING uuid, user_id
         )
         SELECT cu.public_id, cd.uuid AS device_uuid
         FROM created_user cu
         JOIN created_device cd ON cd.user_id = cu.id`,
        [masterPublicKey, devicePublicKey, label ?? null],
      )

      const row = result.rows[0]
      if (!row) {
        return reply.code(500).send({ message: 'Could not create account' })
      }

      return reply.code(201).send({ publicId: row.public_id, deviceUuid: row.device_uuid })
    }
    catch (error) {
      // Safe to be specific: we only get here once the master signature verified.
      // Not idempotent on purpose, "master exists so just enroll the device" would
      // be a nonce-free enrolment endpoint bypassing /auth/device's challenge.
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ message: 'Account already exists' })
      }

      throw error
    }
  })

  /**
   * Single-use nonce, for a device key (open a session) or a master key (enroll a
   * device). The key is never looked up: answering "unknown key" is an enumeration
   * oracle, and a nonce is useless without the private half.
   */
  fastify.post('/auth/challenge', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = authChallengeBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(INVALID_REQUEST)
    }

    const issued = 'devicePublicKey' in parsed.data
      ? await issueChallenge(fastify.db, parsed.data.devicePublicKey, 'session')
      : await issueChallenge(fastify.db, parsed.data.masterPublicKey, 'device-register')

    return reply.send({ nonce: issued.nonce, expiresAt: issued.expiresAt.toISOString() })
  })

  /**
   * POST /auth/session
   * Exchange a signed challenge for an opaque session token.
   */
  fastify.post('/auth/session', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = authSessionBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(INVALID_REQUEST)
    }

    const { devicePublicKey, nonce, signature } = parsed.data

    // Signature first, nonce spent second. A nonce isn't a secret, so consuming it
    // first would let anyone who saw one burn it with a garbage signature. Replay
    // stays closed, consumption is atomic and precedes the token being minted.
    if (!verifyDeviceSignature(devicePublicKey, sessionMessage(devicePublicKey, nonce), signature)) {
      return reply.code(401).send(UNAUTHORIZED)
    }

    if (!await consumeChallenge(fastify.db, nonce, devicePublicKey, 'session')) {
      return reply.code(401).send(UNAUTHORIZED)
    }

    const device = await fastify.db.query<{ id: number }>(
      'SELECT id FROM user_device WHERE public_key = $1 AND revoked_at IS NULL',
      [devicePublicKey],
    )
    const deviceRow = device.rows[0]
    if (!deviceRow) {
      return reply.code(401).send(UNAUTHORIZED)
    }

    const sessionToken = generateSessionToken()
    await fastify.db.query(
      `INSERT INTO user_session (device_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(secs => $3))`,
      [deviceRow.id, hashSessionToken(sessionToken), SESSION_TTL_SECONDS],
    )

    // Relative seconds, the extension shouldn't have to trust its own clock
    return reply.send({ sessionToken, expiresIn: SESSION_TTL_SECONDS })
  })

  /**
   * Enroll a new device key on an existing account. Public because the master
   * signature *is* the auth. Only point where a user needs their recovery phrase.
   */
  fastify.post('/auth/device', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 hour',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = authDeviceBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(INVALID_REQUEST)
    }

    const { masterPublicKey, devicePublicKey, nonce, signature, label } = parsed.data
    if (!verifyMasterSignature(masterPublicKey, deviceRegisterMessage(masterPublicKey, devicePublicKey, nonce), signature)) {
      return reply.code(401).send(UNAUTHORIZED)
    }

    if (!await consumeChallenge(fastify.db, nonce, masterPublicKey, 'device-register')) {
      return reply.code(401).send(UNAUTHORIZED)
    }

    // Lookup, cap check and insert in one statement, so the happy path is one round
    // trip. Doesn't fully close the race: under READ COMMITTED the count subquery
    // takes no lock, so two calls can both land the 20th device. Fine for a soft cap.
    const inserted = await fastify.db.query<{ uuid: string }>(
      `WITH target_user AS (
         SELECT id FROM "user" WHERE master_public_key = $1
       ),
       within_cap AS (
         SELECT tu.id
         FROM target_user tu
         WHERE (
           SELECT count(*) FROM user_device d
           WHERE d.user_id = tu.id AND d.revoked_at IS NULL
         ) < $4
       )
       INSERT INTO user_device (user_id, public_key, label)
       SELECT id, $2, $3 FROM within_cap
       ON CONFLICT (public_key) DO NOTHING
       RETURNING uuid`,
      [masterPublicKey, devicePublicKey, label ?? null, MAX_ACTIVE_DEVICES],
    )
    const insertedRow = inserted.rows[0]
    if (insertedRow) {
      return reply.code(201).send({ deviceUuid: insertedRow.uuid })
    }

    // No row means unknown account, cap reached, or key already registered. One
    // query to tell the three apart.
    const state = await fastify.db.query<{ uuid: string | null, active_devices: string }>(
      `SELECT
         (SELECT d.uuid FROM user_device d
          JOIN "user" u ON u.id = d.user_id
          WHERE d.public_key = $2 AND u.master_public_key = $1 AND d.revoked_at IS NULL) AS uuid,
         (SELECT count(*) FROM user_device d
          JOIN "user" u ON u.id = d.user_id
          WHERE u.master_public_key = $1 AND d.revoked_at IS NULL) AS active_devices`,
      [masterPublicKey, devicePublicKey],
    )
    const stateRow = state.rows[0]

    // Retrying after a network timeout isn't an error, so an active device on this
    // same account gets a 200.
    if (stateRow?.uuid) {
      return reply.send({ deviceUuid: stateRow.uuid })
    }

    if (Number(stateRow?.active_devices ?? 0) >= MAX_ACTIVE_DEVICES) {
      return reply.code(409).send({ message: 'Device limit reached' })
    }

    // Unknown account, key owned by someone else, or a revoked device. All three get
    // the same 401, so this never reveals whether an account exists for a key.
    return reply.code(401).send(UNAUTHORIZED)
  })

  /**
   * Cheapest "is my session alive" probe, and the smoke test for the whole chain.
   * The onRequest hook does the auth, so getting here means the session is good.
   */
  fastify.get('/auth/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ publicId: request.user.publicId, deviceUuid: request.user.deviceUuid })
  })
}
