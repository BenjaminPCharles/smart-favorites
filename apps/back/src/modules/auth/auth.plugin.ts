import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthenticatedUser } from './auth.service'
import fp from 'fastify-plugin'
import { resolveSession } from './auth.service'

declare module 'fastify' {
  interface FastifyRequest {
    getBearerToken: () => string | null
    user: AuthenticatedUser
  }
}

const PUBLIC_ROUTES = new Set([
  'GET /',
  'POST /auth/init',
  'POST /auth/challenge',
  'POST /auth/session',
  'POST /auth/device',
])

export const authPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.decorateRequest('user', null as unknown as AuthenticatedUser)
  fastify.decorateRequest('getBearerToken', function (this: FastifyRequest) {
    const [scheme, token] = this.headers.authorization?.split(' ') ?? []
    return scheme === 'Bearer' && token ? token : null
  })

  fastify.addHook('onRequest', async (request, reply) => {
    /**
     * CORS preflight carries no Authorization header
     */
    if (request.method === 'OPTIONS') {
      return
    }

    const routeUrl = request.routeOptions.url
    if (!routeUrl) {
      return
    }

    if (PUBLIC_ROUTES.has(`${request.method} ${routeUrl}`)) {
      return
    }

    const token = request.getBearerToken()
    const user = token ? await resolveSession(fastify.db, token) : null
    if (!user) {
      await reply.code(401).send({ message: 'Unauthorized' })
      return
    }

    request.user = user
  })
})
