import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  authChallengeBodySchema,
  authDeviceBodySchema,
  authInitBodySchema,
  authSessionBodySchema,
} from './auth.schema'
import { createAccount, enrollDevice, issueAuthChallenge, openSession } from './auth.service'

// Wire layer only: parse, delegate to auth.service.ts, map a status to a code.

/**
 * Two rules here: never pass `request.body` to `request.log.*`, never return zod
 * issues. Both echo request content, see the `redact` config in app.ts.
 */

/** Shape errors only depend on the request bytes, so they give nothing away. */
const INVALID_REQUEST = { message: 'Invalid request' }
/**
 * Anything depending on a database row gets this: bad signature, spent nonce,
 * revoked device, unknown account. Telling them apart is an enumeration oracle.
 */
// Also the fallthrough of every mapping below, so a new service status is fail-closed.
const UNAUTHORIZED = { message: 'Unauthorized' }

export function authRoutes(fastify: FastifyInstance): void {
  /** Create an account from a master public key plus a first device key. */
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

    const result = await createAccount(fastify.db, parsed.data)

    if (result.status === 'created') {
      return reply.code(201).send({ publicId: result.publicId, deviceUuid: result.deviceUuid })
    }

    if (result.status === 'conflict') {
      return reply.code(409).send({ message: 'Account already exists' })
    }

    if (result.status === 'failed') {
      return reply.code(500).send({ message: 'Could not create account' })
    }

    return reply.code(401).send(UNAUTHORIZED)
  })

  /** Single-use nonce, for a device key (open a session) or a master key (enroll a device). */
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

    const issued = await issueAuthChallenge(fastify.db, parsed.data)

    return reply.send({ nonce: issued.nonce, expiresAt: issued.expiresAt.toISOString() })
  })

  /** Exchange a signed challenge for an opaque session token. */
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

    const result = await openSession(fastify.db, parsed.data)

    if (result.status === 'opened') {
      return reply.send({ sessionToken: result.sessionToken, expiresIn: result.expiresIn })
    }

    return reply.code(401).send(UNAUTHORIZED)
  })

  /** Enroll a new device key on an existing account. Public: the master signature is the auth. */
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

    const result = await enrollDevice(fastify.db, parsed.data)

    if (result.status === 'enrolled') {
      return reply.code(201).send({ deviceUuid: result.deviceUuid })
    }

    // A retry after a network timeout isn't an error, so this is a 200 and not a 409
    if (result.status === 'already-enrolled') {
      return reply.send({ deviceUuid: result.deviceUuid })
    }

    if (result.status === 'device-limit') {
      return reply.code(409).send({ message: 'Device limit reached' })
    }

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
