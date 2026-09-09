const UNIQUE_VIOLATION = '23505'

/**
 * True for a unique-key race, so the caller answers 409 without echoing pg's `detail`.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION
}
