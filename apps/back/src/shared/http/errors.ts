// The response payloads that must be byte-identical across every module. Anything a single
// route happens to say stays inline in that route, next to the status it maps.
// No free-form message parameter here: that is how request content ends up echoed back, and
// how two callers start telling apart causes that must stay indistinguishable.

/** Shape errors only depend on the request bytes, so they give nothing away. */
export const INVALID_REQUEST = { message: 'Invalid request' } as const

/** Anything depending on a database row: bad signature, spent nonce, revoked device, unknown account. */
// Also the fallthrough of every status mapping, so a new service status is fail-closed.
export const UNAUTHORIZED = { message: 'Unauthorized' } as const

// Closed union, so no call site can interpolate request content into a response.
type NotFoundResource = 'Favorite' | 'Device'

/** Same payload whether the row is absent or owned by someone else: a 403 here would be an existence oracle. */
export function notFound(resource: NotFoundResource): { message: string } {
  return { message: `${resource} not found` }
}
