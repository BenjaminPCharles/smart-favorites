import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Buffer } from 'node:buffer'
import argon2 from 'argon2'

export function authRoutes(fastify: FastifyInstance): void {
  /**
   * POST /auth/init
   * Creates a new anonymous user with a generated publicId and secret.
   * Returns a base64-encoded token (publicId:secret) to be used for subsequent auth.
   */
  fastify.post('/auth/init', async (_: FastifyRequest, reply: FastifyReply) => {
    const publicId = crypto.randomUUID()
    const secret = crypto.randomUUID()
    const token = Buffer.from(`${publicId}:${secret}`).toString('base64')

    const secretHash = await argon2.hash(secret)

    await fastify.db.query(
      'INSERT INTO "user" (publicId, secretHash) VALUES ($1, $2)',
      [publicId, secretHash],
    )

    reply.code(201).send({ message: 'ok', token })
  })

  /**
   * POST /auth/verify
   * Verifies a base64-encoded token (publicId:secret).
   * Looks up the user by publicId and checks the secret against the stored argon2 hash.
   * Returns 401 if the token is malformed, the user is not found, or the secret is invalid.
   */
  fastify.get('/auth/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.getBearerToken()
    if (!token) {
      reply.code(401).send({ message: 'Token malformed' })
      return
    }
    const [publicId, secret] = Buffer.from(token, 'base64').toString('utf8').split(':')
    if (!publicId || !secret) {
      reply.code(401).send({ message: 'Token malformed' })
      return
    }

    const result = await fastify.db.query<{ secretHash: string }>(
      'SELECT "secretHash" FROM "user" WHERE "publicId" = $1',
      [publicId],
    )
    const user = result.rows[0]
    if (!user) {
      reply.code(401).send({ message: 'Unauthorized' })
      return
    }

    const valid = await argon2.verify(user.secretHash, secret)
    if (!valid) {
      reply.code(401).send({ message: 'Unauthorized' })
    }

    reply.code(200).send({ message: 'Ok' })
  })
}
