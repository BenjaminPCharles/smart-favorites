/**
 * Turn anything thrown into a message that can be shown to the user.
 * @param error
 * @return {string}
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
