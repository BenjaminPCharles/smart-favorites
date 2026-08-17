import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { hashSessionToken, sessionTokenMatchesHash } from '../helpers/session-token.helper'

export interface AuthenticatedUser {
  id: number
  publicId: string
  /**
   * Which device this session belongs to. Makes a compromise attributable, and the
   * per-device revocation screen needs it.
   */
  deviceId: number
  deviceUuid: string
  /** Kept so a session can be revoked without a second lookup. */
  sessionId: number
}

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

    // No route matched, let Fastify answer 404 rather than 401
    const routeUrl = request.routeOptions.url
    if (!routeUrl) {
      return
    }

    if (PUBLIC_ROUTES.has(`${request.method} ${routeUrl}`)) {
      return
    }

    const user = await resolveUser(fastify, request)
    if (!user) {
      // Same answer for missing token, unknown session, expired session and revoked
      // device. Telling them apart makes this an oracle.
      await reply.code(401).send({ message: 'Unauthorized' })
      return
    }

    request.user = user
  })
})

/**
 * Null when the token is missing, unknown, expired, or its device was revoked.
 */
async function resolveUser(fastify: FastifyInstance, request: FastifyRequest): Promise<AuthenticatedUser | null> {
  const token = request.getBearerToken()
  if (!token) {
    return null
  }

  // One round trip. A data-modifying CTE runs whether or not it's read, so nothing
  // references `touched`. `d.revoked_at IS NULL` is what makes "revoking a device
  // kills its sessions" true on the next request, don't drop it as an optimisation.

  // last_used_at throttled to 5 min, otherwise it's a row lock and a WAL record per
  // API call for a field only a "last seen" line in the UI reads.
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
