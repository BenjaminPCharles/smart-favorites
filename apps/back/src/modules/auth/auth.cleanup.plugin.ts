import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import cron from 'node-cron'
import { purgeExpiredChallenges, purgeExpiredSessions } from './auth.repository'

const PURGE_SCHEDULE = '*/5 * * * *'

export const authCleanupPlugin = fp(async (fastify: FastifyInstance) => {
  const task = cron.schedule(PURGE_SCHEDULE, async () => {
    try {
      const challenges = await purgeExpiredChallenges(fastify.db)
      const sessions = await purgeExpiredSessions(fastify.db)
      fastify.log.debug({ challenges, sessions }, 'Auth cleanup')
    }
    catch (error) {
      fastify.log.error({ err: error }, 'Auth cleanup failed')
    }
  }, { noOverlap: true })

  fastify.addHook('onClose', async () => {
    await task.stop()
  })
})
