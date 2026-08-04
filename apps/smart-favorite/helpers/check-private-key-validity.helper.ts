const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const INVALID = { isValid: false, errorMessage: 'Private key is not a valid key' } as const

/**
 * Check the shape of a private key locally, before sending it to the server.
 * A key is `base64url(publicId:secret)` — see AUTH.md. This only rules out
 * typos and truncated pastes; only the server can tell whether the key exists.
 * @param privateKey
 * @return {{ isValid: true } | { isValid: false, errorMessage: string }}
 */
export function checkPrivateKeyValidity(privateKey: string): { isValid: true } | { isValid: false, errorMessage: string } {
  const trimmed = privateKey.trim()
  if (!trimmed) {
    return INVALID
  }

  let decoded: string
  try {
    // atob only accepts standard base64, so restore the alphabet and padding
    const base64 = trimmed.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(trimmed.length / 4) * 4, '=')
    decoded = atob(base64)
  }
  catch {
    return INVALID
  }

  const separatorIndex = decoded.indexOf(':')
  if (separatorIndex <= 0) {
    return INVALID
  }

  const publicId = decoded.slice(0, separatorIndex)
  const secret = decoded.slice(separatorIndex + 1)
  if (!UUID_REGEX.test(publicId) || !secret) {
    return INVALID
  }

  return { isValid: true }
}
