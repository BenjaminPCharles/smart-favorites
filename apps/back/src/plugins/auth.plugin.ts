import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { decodeToken, verifySecret } from '../helpers/token.helper'

export interface AuthenticatedUser {
  id: number
  publicId: string
}

declare module 'fastify' {
  interface FastifyRequest {
    getBearerToken: () => string | null
    /**
     * Typed as always present because the fail-closed hook below rejects every
     * request that reaches a non-public handler without a valid token — same
     * convention as @fastify/jwt. It is actually null inside PUBLIC_ROUTES
     * handlers, which must not read it.
     */
    user: AuthenticatedUser
  }
}

/**
 * Routes reachable without a token, matched on the registered route pattern.
 * Everything else is authenticated: the hook is fail-closed, so a new route is
 * protected unless it is explicitly listed here.
 */
const PUBLIC_ROUTES = new Set([
  'GET /',
  'POST /auth/init',
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

    // No route matched — let Fastify answer 404 rather than 401
    const routeUrl = request.routeOptions.url
    if (!routeUrl) {
      return
    }

    if (PUBLIC_ROUTES.has(`${request.method} ${routeUrl}`)) {
      return
    }

    const user = await resolveUser(fastify, request)
    if (!user) {
      // Uniform response: never distinguish malformed token / unknown user /
      // bad secret, that would turn the endpoint into an oracle.
      await reply.code(401).send({ message: 'Unauthorized' })
      return
    }

    request.user = user
  })
})

/**
 * Resolve the authenticated user from the request's bearer token.
 * @param fastify
 * @param request
 * @return {Promise<AuthenticatedUser | null>} null when the token is absent, malformed or invalid
 */
async function resolveUser(fastify: FastifyInstance, request: FastifyRequest): Promise<AuthenticatedUser | null> {
  const token = request.getBearerToken()
  if (!token) {
    return null
  }

  const decoded = decodeToken(token)
  if (!decoded) {
    return null
  }

  const result = await fastify.db.query<{ id: number, secret_hash: string }>(
    'SELECT id, secret_hash FROM "user" WHERE public_id = $1',
    [decoded.publicId],
  )
  const row = result.rows[0]
  if (!row || !verifySecret(decoded.secret, row.secret_hash)) {
    return null
  }

  return { id: row.id, publicId: decoded.publicId }
}
