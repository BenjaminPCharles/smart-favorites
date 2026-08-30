import type { FastifyInstance } from 'fastify'
import process from 'node:process'
import { buildApp } from './app'
import { servicesContainer } from './container'

/** Owns the process: the port, the signals, the exit codes. The server itself is app.ts. */

/**
 * Without this the process dies where it stands: requests cut, pg pool never drained,
 * auth.cleanup.plugin's onClose never run. `once` and not `on`, so a second Ctrl-C
 * during a slow drain still kills us through the default handler.
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
    // Fail fast on a database that isn't there, rather than on the first request
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
  // buildApp itself failed, so there is no logger to report through
  console.error('Startup failed:', error)
  process.exit(1)
})
