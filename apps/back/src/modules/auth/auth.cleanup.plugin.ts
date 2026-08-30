import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import cron from 'node-cron'
import { purgeExpiredChallenges, purgeExpiredSessions } from './auth.repository'

/** Often enough to keep the tables small, rare enough to go unnoticed. */
const PURGE_SCHEDULE = '*/5 * * * *'

/**
 * Both statements are idempotent and take no meaningful lock, so concurrent
 * instances are fine and there's no leader election to do. Also the backstop that
 * bounds auth_challenge whatever the per-process rate limit does.
 */
export const authCleanupPlugin = fp(async (fastify: FastifyInstance) => {
  const task = cron.schedule(PURGE_SCHEDULE, async () => {
    try {
      const challenges = await purgeExpiredChallenges(fastify.db)
      const sessions = await purgeExpiredSessions(fastify.db)
      fastify.log.debug({ challenges, sessions }, 'Auth cleanup')
    }
    catch (error) {
      // A failed purge must not take the server down
      fastify.log.error({ err: error }, 'Auth cleanup failed')
    }
  }, { noOverlap: true })

  fastify.addHook('onClose', async () => {
    await task.stop()
  })
})
