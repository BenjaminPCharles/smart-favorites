import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthenticatedUser } from './auth.service'
import fp from 'fastify-plugin'
import { resolveSession } from './auth.service'

declare module 'fastify' {
  interface FastifyRequest {
    getBearerToken: () => string | null
    /**
     * Non-nullable because the hook rejects any request reaching a non-public
     * handler without a token, same convention as @fastify/jwt. It really is null
     * inside PUBLIC_ROUTES handlers, so don't read it there.
     */
    user: AuthenticatedUser
  }
}

/**
 * Reachable without a session token. The hook is fail-closed, so a new route is
 * protected until listed here. /auth is public because a signature *is* its
 * authentication, the caller has no session yet.
 */
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
    // CORS preflight carries no Authorization header
    if (request.method === 'OPTIONS') {
      return
    }

    // No route matched, let Fastify answer 404 rather than 401
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
      // Same answer for missing token, unknown session, expired session and revoked
      // device. Telling them apart makes this an oracle.
      await reply.code(401).send({ message: 'Unauthorized' })
      return
    }

    request.user = user
  })
})
