import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import cron from 'node-cron'
import { purgeExpiredChallenges, purgeExpiredSessions } from '../helpers/auth-challenge.helper'

/** Often enough that the tables stay small, rarely enough to be invisible. */
const PURGE_SCHEDULE = '*/5 * * * *'

/**
 * Delete auth rows that can no longer be used.
 *
 * Both statements are idempotent and take no lock worth mentioning, so several
 * instances running this concurrently is harmless — no leader election needed.
 * This is also the backstop that bounds auth_challenge regardless of how well the
 * per-process rate limit holds.
 */
export const cronPlugin = fp(async (fastify: FastifyInstance) => {
  const task = cron.schedule(PURGE_SCHEDULE, async () => {
    try {
      const challenges = await purgeExpiredChallenges(fastify.db)
      const sessions = await purgeExpiredSessions(fastify.db)
      fastify.log.debug({ challenges, sessions }, 'Auth cleanup')
    }
    catch (error) {
      // A failed purge must never take the server down
      fastify.log.error({ err: error }, 'Auth cleanup failed')
    }
  }, { noOverlap: true })

  fastify.addHook('onClose', async () => {
    await task.stop()
  })
})
