import type { FastifyInstance } from 'fastify'
import process from 'node:process'
import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { servicesContainer } from './config/service.container'
import { authPlugin } from './plugins/auth.plugin'
import { dbPlugin } from './plugins/db.plugin'
import { registerRoutes } from './routes'

// Initialize Fastify
const fastify = Fastify({
  logger: true,
})

// Cors — comma separated list, so the extension origin (chrome-extension://<id>)
// can be allowed alongside the local web origin
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

fastify.register(fastifyCors, {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

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

    // Routes register
    await registerRoutes(fastify)

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
