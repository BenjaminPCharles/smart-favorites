import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import process from 'node:process'
import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { servicesContainer } from './config/service.container'
import { authPlugin } from './plugins/auth.plugin'
import { cronPlugin } from './plugins/cron.plugin'
import { dbPlugin } from './plugins/db.plugin'
import { registerRoutes } from './routes'

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

const fastify = Fastify({
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  logger: {
    // Never log a session token or an /auth/* body. Nothing leaks today, these paths
    // keep it that way if someone adds a custom serializer. Not disableRequestLogging
    // though, that would blind us where a traffic spike matters most.
    redact: {
      paths: ['req.headers.authorization', 'headers.authorization', 'sessionToken', '*.sessionToken', 'body'],
      censor: '[redacted]',
    },
  },
})

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

fastify.register(fastifyCors, {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

/**
 * Without this the process dies where it stands: requests cut, pg pool never drained,
 * cron.plugin's onClose never run. `once` and not `on`, so a second Ctrl-C during a
 * slow drain still kills us through the default handler.
 */
function registerShutdown(fastify: FastifyInstance): void {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      fastify.log.info(`${signal} received, closing`)
      fastify.close().then(
        () => process.exit(0),
        (error: unknown) => {
          fastify.log.error({ err: error }, 'Shutdown failed')
          process.exit(1)
        },
      )
    })
  }
}

async function bootstrap(fastify: FastifyInstance): Promise<void> {
  try {
    const serviceClient = await servicesContainer.databaseConfig.connect()
    serviceClient.release()
    fastify.log.info('Database connected successfully')

    // Rate limit before auth, so unauthenticated floods get throttled too
    await fastify.register(fastifyRateLimit, {
      max: 100,
      timeWindow: '1 minute',
    })
    await fastify.register(dbPlugin)
    await fastify.register(authPlugin)
    await fastify.register(cronPlugin)

    // Nothing unhandled reaches the client. A pg unique violation carries a `detail`
    // quoting the conflicting value, which an auth route must never echo back.
    fastify.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      request.log.error({ err: error }, 'Request failed')
      const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500

      return reply.code(statusCode).send({
        message: statusCode === 500 ? 'Internal Server Error' : error.message,
      })
    })

    await registerRoutes(fastify)

    registerShutdown(fastify)

    const PORT = process.env.API_PORT || 3000
    await fastify.listen({ port: Number(PORT) })
    fastify.log.info(`Server is now listening on http://localhost:${PORT}`)
  }
  catch (err) {
    fastify.log.error('Startup failed:', err)
    process.exit(1)
  }
}

bootstrap(fastify)
