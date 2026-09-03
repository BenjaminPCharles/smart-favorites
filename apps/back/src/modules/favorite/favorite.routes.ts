import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { INVALID_REQUEST } from '../../shared/http/errors'
import { favoriteSchema } from './favorite.schema'
import { createFavorite } from './favorite.service'

// Wire layer only: parse, delegate to favorite.service.ts, map a status to a code.

export function favoriteRoutes(fastify: FastifyInstance): void {
  /** Save the current page. Protected: the auth hook is fail-closed, so `request.user` is set here. */
  fastify.post('/favorites', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = favoriteSchema.safeParse(request.body)

    // Never send `parsed.error`: zod issues quote the request content, see the redact config in app.ts
    if (!parsed.success) {
      return reply.code(400).send(INVALID_REQUEST)
    }

    const result = await createFavorite(fastify.db, request.log, request.user.id, parsed.data)

    if (result.status === 'conflict') {
      return reply.code(409).send({ message: 'Favorite already saved' })
    }

    return reply.code(201).send({ message: 'Favorite created' })
  })
}
