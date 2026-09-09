import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { INVALID_REQUEST } from '../../shared/http/errors'
import { favoriteLookupSchema, favoriteSchema } from './favorite.schema'
import { createFavorite, isFavoriteSaved } from './favorite.service'

export function favoriteRoutes(fastify: FastifyInstance): void {
  /**
   * Saves the current page for the session owner.
   */
  fastify.post('/favorites', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = favoriteSchema.safeParse(request.body)

    if (!parsed.success) {
      return reply.code(400).send(INVALID_REQUEST)
    }

    const result = await createFavorite(fastify.db, request.log, request.user.id, parsed.data)

    if (result.status === 'conflict') {
      return reply.code(409).send({ message: 'Favorite already saved' })
    }

    return reply.code(201).send({ message: 'Favorite created' })
  })

  /**
   * Reports whether the session owner already saved this url, taken from the body to stay out of logs.
   */
  fastify.post('/favorites/lookup', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = favoriteLookupSchema.safeParse(request.body)

    if (!parsed.success) {
      return reply.code(400).send(INVALID_REQUEST)
    }

    const exists = await isFavoriteSaved(fastify.db, request.user.id, parsed.data.url)

    return reply.send({ exists })
  })
}
