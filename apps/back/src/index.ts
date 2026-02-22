import type { FastifyInstance } from 'fastify'
import process from 'node:process'
import fastifyCors from '@fastify/cors'
import Fastify from 'fastify'
import { servicesContainer } from './config/service.container'
import { registerRoutes } from './routes'

// Initialize Fastify
const fastify = Fastify({
  logger: true,
})

// Cors
fastify.register(fastifyCors, {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
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
