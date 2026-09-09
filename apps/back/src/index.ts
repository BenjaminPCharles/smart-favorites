import type { FastifyInstance } from 'fastify'
import process from 'node:process'
import { buildApp } from './app'
import { servicesContainer } from './container'

/**
 * Drains the server once on SIGINT and SIGTERM, so requests finish and the pg pool closes.
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

async function main(): Promise<void> {
  const fastify = await buildApp()

  try {
    const serviceClient = await servicesContainer.databaseConfig.connect()
    serviceClient.release()
    fastify.log.info('Database connected successfully')

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

main().catch((error: unknown) => {
  console.error('Startup failed:', error)
  process.exit(1)
})
