import type { FastifyInstance } from 'fastify'

export function favoriteRoutes(fastify: FastifyInstance): void {
  // TODO: read the body and hand it to favorite.service once it exists
  fastify.post('/favorites', async () => {})
}
