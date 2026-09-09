import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest, FastifyServerOptions } from 'fastify'
import process from 'node:process'
import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { authCleanupPlugin } from './modules/auth/auth.cleanup.plugin'
import { authPlugin } from './modules/auth/auth.plugin'
import { authRoutes } from './modules/auth/auth.routes'
import { favoriteRoutes } from './modules/favorite/favorite.routes'
import { healthRoutes } from './modules/health/health.routes'
import { dbPlugin } from './shared/db/db.plugin'

const LOGGER_OPTIONS = {
  redact: {
    paths: ['req.headers.authorization', 'headers.authorization', 'sessionToken', '*.sessionToken', 'body'],
    censor: '[redacted]',
  },
}

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger']
}

/**
 * Reads TRUST_PROXY as a hop count, returning `false` when unset or 0 rather than a truthy number.
 */
function parseTrustProxy(value: string | undefined): number | false {
  if (!value) {
    return false
  }

  const hops = Number(value)

  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(`TRUST_PROXY must be a hop count (0, 1, 2, ...), received "${value}"`)
  }

  return hops === 0 ? false : hops
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    logger: options.logger ?? LOGGER_OPTIONS,
  })

  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

  await fastify.register(fastifyCors, {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  await fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })
  await fastify.register(dbPlugin)
  await fastify.register(authPlugin)
  await fastify.register(authCleanupPlugin)

  fastify.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error({ err: error }, 'Request failed')
    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500

    return reply.code(statusCode).send({
      message: statusCode === 500 ? 'Internal Server Error' : error.message,
    })
  })

  await fastify.register(healthRoutes)
  await fastify.register(authRoutes)
  await fastify.register(favoriteRoutes)

  return fastify
}
