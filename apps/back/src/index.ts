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
 * How many proxies sit in front, from `TRUST_PROXY`: `true`, a hop count, or a CIDR
 * list. Off unless set, and that default is the safe one in both directions.
 *
 * Trusting `X-Forwarded-For` when nothing strips it lets any client claim any IP and
 * walk straight through the per-IP auth limits. Not trusting it when a proxy *is* in
 * front is the opposite failure and just as real: every request then carries the
 * proxy's address, so the 5/hour on /auth/init and the 20/min on /auth/challenge
 * collapse into one global bucket and the first user to hit it locks out everyone.
 * @param value
 * @return {boolean | string | number}
 */
function parseTrustProxy(value: string | undefined): boolean | string | number {
  if (!value || value === 'false') {
    return false
  }
  if (value === 'true') {
    return true
  }

  const hops = Number(value)

  return Number.isInteger(hops) && hops > 0 ? hops : value
}

// Initialize Fastify
const fastify = Fastify({
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  logger: {
    // Never log a session token nor an /auth/* body. Fastify's default serializers
    // already omit headers and bodies, and onRequest runs before body parsing — so
    // there is nothing leaking today. These paths are what keeps that true if a
    // custom serializer is ever added, and pino applies them to anything logged by
    // hand.
    //
    // Deliberately not disableRequestLogging nor a reduced logLevel on /auth/*:
    // that would blind exactly the endpoints where a spike matters most.
    redact: {
      paths: ['req.headers.authorization', 'headers.authorization', 'sessionToken', '*.sessionToken', 'body'],
      censor: '[redacted]',
    },
  },
})

// Cors — comma separated list, so the extension origin (chrome-extension://<id>)
// can be allowed alongside the local web origin.
// This must stay a strict allowlist: never `origin: true`, never '*'. A foreign
// page cannot sign anything, but it can trigger these handlers cross-origin, and
// the allowlist is what stops it reading the answers.
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
 * Close the server on the signals a supervisor actually sends.
 *
 * Without this the process dies where it stands: requests in flight are cut, the pg
 * pool is never drained, and the `onClose` hook of cron.plugin — which exists only to
 * stop the purge task — never runs.
 *
 * `once`, so a second Ctrl-C during a slow drain still kills the process through the
 * default handler rather than being swallowed.
 * @param fastify
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

// Start
async function bootstrap(fastify: FastifyInstance): Promise<void> {
  try {
    // Verify database connectivity before starting the server
    const serviceClient = await servicesContainer.databaseConfig.connect()
    serviceClient.release()
    fastify.log.info('Database connected successfully')

    // Register plugins — rate limit before auth so throttling is applied even
    // to unauthenticated floods
    await fastify.register(fastifyRateLimit, {
      max: 100,
      timeWindow: '1 minute',
    })
    await fastify.register(dbPlugin)
    await fastify.register(authPlugin)
    await fastify.register(cronPlugin)

    // Any unhandled throw must not reach the client: a pg unique violation carries
    // a `detail` quoting the conflicting value, and an auth route is the last place
    // that should echo request-derived content.
    fastify.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      request.log.error({ err: error }, 'Request failed')
      const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500

      return reply.code(statusCode).send({
        message: statusCode === 500 ? 'Internal Server Error' : error.message,
      })
    })

    // Routes register
    await registerRoutes(fastify)

    registerShutdown(fastify)

    // Run the server
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
