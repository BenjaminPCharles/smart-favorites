import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { servicesContainer } from '../container'

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof servicesContainer.databaseConfig.getPool>
  }
}

export const dbPlugin = fp(async (fastify: FastifyInstance) => {
  const pool = servicesContainer.databaseConfig.getPool()
  fastify.decorate('db', pool)
})
