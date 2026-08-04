import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { encodeToken, generateSecret, hashSecret } from '../helpers/token.helper'

export function authRoutes(fastify: FastifyInstance): void {
  /**
   * POST /auth/init
   * Creates a new anonymous user and returns its bearer token.
   * The secret is only ever returned here — the database keeps a hash of it, so
   * a lost token cannot be recovered. Public route (see auth.plugin.ts), hence
   * the strict rate limit: it is the only endpoint that writes rows for an
   * unauthenticated caller.
   */
  fastify.post('/auth/init', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 hour',
      },
    },
  }, async (_: FastifyRequest, reply: FastifyReply) => {
    const secret = generateSecret()

    const result = await fastify.db.query<{ public_id: string }>(
      'INSERT INTO "user" (secret_hash) VALUES ($1) RETURNING public_id',
      [hashSecret(secret)],
    )
    const row = result.rows[0]
    if (!row) {
      return reply.code(500).send({ message: 'Could not create account' })
    }

    return reply.code(201).send({ token: encodeToken(row.public_id, secret) })
  })

  /**
   * GET /auth/verify
   * Confirms a token is valid. Authentication itself is done by the global
   * onRequest hook, so reaching this handler already means the token is good.
   */
  fastify.get('/auth/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ publicId: request.user.publicId })
  })
}
