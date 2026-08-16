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
 * Never pass `request.body` to `request.log.*` in this file, and never return zod
 * issues: both echo request content, which is what "no /auth/* body in the logs"
 * forbids. See the `redact` config in index.ts.
 */

/** Shape errors depend only on the request bytes, so they reveal nothing. */
const INVALID_REQUEST = { message: 'Invalid request' }
/**
 * Everything whose answer depends on a database row collapses into this single
 * response — a bad signature, an unknown or spent nonce, an unknown or revoked
 * device, an unknown account. Distinguishing them would turn these endpoints into
 * an oracle for enumerating public keys.
 */
const UNAUTHORIZED = { message: 'Unauthorized' }

/** A soft cap, so one stolen mnemonic cannot enroll devices without bound. */
const MAX_ACTIVE_DEVICES = 20

export function authRoutes(fastify: FastifyInstance): void {
  /**
   * POST /auth/init
   * Create an account from a master public key and a first device key. The master
   * signature is the authentication: nobody but the key holder reaches the insert.
   *
   * No session is returned. The client immediately runs /auth/challenge +
   * /auth/session, which keeps exactly one code path minting sessions — the same
   * one every silent renewal uses.
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
      // One statement, so the user and its first device are atomic without an
      // explicit transaction
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
      // Safe to distinguish here: the route is only reachable once the master
      // signature verified, so only the key holder can trigger it. One message for
      // both the master and the device conflict.
      //
      // Deliberately not idempotent — "if the master key exists, just enroll the
      // device" would make this a nonce-free device-enrolment endpoint, silently
      // bypassing the single-use challenge /auth/device exists to enforce.
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ message: 'Account already exists' })
      }

      throw error
    }
  })

  /**
   * POST /auth/challenge
   * Issue a single-use nonce, for either a device key (to open a session) or a
   * master key (to enroll a device).
   *
   * The key is deliberately not looked up: answering "unknown key" would be an
   * enumeration oracle, and a nonce is worthless without the matching private key.
   * An unknown key fails one step later, as a uniform 401.
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

    // The signature is checked before the nonce is spent, on purpose. A nonce is
    // not a secret — it can sit in a proxy log or a devtools panel — so if
    // consumption came first, anyone who observed one could burn it with a garbage
    // signature and grief the legitimate client. Replay stays closed: consumption
    // is atomic and precedes the token being minted, so of two concurrent requests
    // carrying the same valid (nonce, signature) one wins the UPDATE and the other
    // gets a 401.
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

    // Relative seconds, so the extension never has to trust its own clock against
    // the server's
    return reply.send({ sessionToken, expiresIn: SESSION_TTL_SECONDS })
  })

  /**
   * POST /auth/device
   * Enroll a new device key on an existing account. Public, because the master
   * signature *is* the authentication: the caller has no session yet, by
   * definition. This is the only moment a user needs their recovery phrase.
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

    // Account lookup, cap and insert in one statement. Folding the cap into the
    // INSERT keeps the happy path to a single round trip, and shrinks the window in
    // which two concurrent enrolments both see room from "two round trips" to one
    // statement's snapshot.
    //
    // It does not close it: under READ COMMITTED the count subquery takes no lock, so
    // two racing calls can still both land the 20th device. Making it a hard cap
    // needs a transaction holding `SELECT … FOR UPDATE` on the user row, which is not
    // worth a dedicated pool client while this stays what docs/AUTH.md calls it — a
    // soft cap on an account the caller already controls, whose only job is to stop
    // one stolen mnemonic enrolling devices without bound.
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

    // No row: unknown account, cap reached, or the key is already registered. One
    // query tells the three apart.
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

    // Retrying an enrolment after a network timeout is not an error, so an active
    // device of this same account answers 200.
    if (stateRow?.uuid) {
      return reply.send({ deviceUuid: stateRow.uuid })
    }

    if (Number(stateRow?.active_devices ?? 0) >= MAX_ACTIVE_DEVICES) {
      return reply.code(409).send({ message: 'Device limit reached' })
    }

    // Unknown account, or a key belonging to another account — or to a revoked
    // device, which stays dead by design. All three get the uniform 401, so this
    // never reveals whether an account exists for the key.
    return reply.code(401).send(UNAUTHORIZED)
  })

  /**
   * GET /auth/verify
   * The cheapest "is my session still alive" probe, and the smoke test for the
   * whole chain. Authenticated by the global onRequest hook, so reaching this
   * handler already means the session is good.
   */
  fastify.get('/auth/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ publicId: request.user.publicId, deviceUuid: request.user.deviceUuid })
  })
}
