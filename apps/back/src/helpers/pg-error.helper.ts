const UNIQUE_VIOLATION = '23505'

/**
 * Detect a Postgres unique-constraint violation.
 *
 * Used to turn a race on the unique keys into a 409 instead of a 500 — and to keep
 * pg's error `detail`, which quotes the conflicting value, out of the response and
 * out of the logs.
 * @param error
 * @return {boolean}
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION
}
