import type { FastifyInstance } from 'fastify'
import { authRoutes } from './auth.routes'
import { healthRoutes } from './health.routes'

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(healthRoutes)
  await fastify.register(authRoutes)
}
