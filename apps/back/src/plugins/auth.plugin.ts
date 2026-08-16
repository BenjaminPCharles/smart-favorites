import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { hashSessionToken, sessionTokenMatchesHash } from '../helpers/session-token.helper'

export interface AuthenticatedUser {
  id: number
  publicId: string
  /**
   * The device the session belongs to. Selected here because it is what makes a
   * compromise attributable, and what a per-device revocation screen needs.
   */
  deviceId: number
  deviceUuid: string
  /** The session itself, so it can be revoked without a second lookup. */
  sessionId: number
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
 * Routes reachable without a session token, matched on the registered route
 * pattern. Everything else is authenticated: the hook is fail-closed, so a new
 * route is protected unless it is explicitly listed here.
 *
 * The four /auth routes are public because a signature *is* their authentication —
 * their caller has no session yet, by definition.
 */
const PUBLIC_ROUTES = new Set([
  'GET /',
  'POST /auth/init',
  'POST /auth/challenge',
  'POST /auth/session',
  'POST /auth/device',
])

interface SessionRow {
  session_id: number
  token_hash: string
  device_id: number
  device_uuid: string
  user_id: number
  public_id: string
}

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
      // Uniform response: never distinguish absent token / unknown session /
      // expired session / revoked device, that would turn the endpoint into an
      // oracle.
      await reply.code(401).send({ message: 'Unauthorized' })
      return
    }

    request.user = user
  })
})

/**
 * Resolve the authenticated user from the request's session token.
 * @param fastify
 * @param request
 * @return {Promise<AuthenticatedUser | null>} null when the token is absent, unknown, expired, or its device is revoked
 */
async function resolveUser(fastify: FastifyInstance, request: FastifyRequest): Promise<AuthenticatedUser | null> {
  const token = request.getBearerToken()
  if (!token) {
    return null
  }

  // One round trip on the hot path. A data-modifying CTE runs to completion whether
  // or not the outer query reads it, so `touched` needs no reference.
  //
  // `d.revoked_at IS NULL` in the join is what actually enforces "revoking a device
  // kills its sessions": it takes effect on the very next request, independently of
  // any DELETE. Do not remove it as an optimisation — the DELETE that a revoke
  // endpoint will also perform is defence in depth, not the mechanism.
  //
  // `last_used_at` is throttled to a 5-minute granularity on purpose: writing it on
  // every request would mean a row lock and a WAL record per API call, for a field
  // whose only consumer is a "last seen" line in a UI. With the guard the UPDATE
  // matches no row almost always, and takes no lock.
  const result = await fastify.db.query<SessionRow>(
    `WITH matched AS (
       SELECT
         s.id         AS session_id,
         s.token_hash AS token_hash,
         d.id         AS device_id,
         d.uuid       AS device_uuid,
         u.id         AS user_id,
         u.public_id  AS public_id
       FROM user_session s
       JOIN user_device d ON d.id = s.device_id
       JOIN "user" u ON u.id = d.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND d.revoked_at IS NULL
     ),
     touched AS (
       UPDATE user_device
       SET last_used_at = now()
       WHERE id IN (SELECT device_id FROM matched)
         AND (last_used_at IS NULL OR last_used_at < now() - interval '5 minutes')
       RETURNING id
     )
     SELECT session_id, token_hash, device_id, device_uuid, user_id, public_id FROM matched`,
    [hashSessionToken(token)],
  )

  const row = result.rows[0]
  if (!row || !sessionTokenMatchesHash(token, row.token_hash)) {
    return null
  }

  return {
    id: row.user_id,
    publicId: row.public_id,
    deviceId: row.device_id,
    deviceUuid: row.device_uuid,
    sessionId: row.session_id,
  }
}
