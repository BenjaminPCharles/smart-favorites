import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyRequest {
    getBearerToken: () => string | null
  }
}

export const authPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.decorateRequest('getBearerToken', function (this: FastifyRequest) {
    const [scheme, token] = this.headers.authorization?.split(' ') ?? []
    return scheme === 'Bearer' && token ? token : null
  })
})
