/**
 * Unpadded base64url. `btoa` is all we get, there's no Buffer in a browser bundle.
 * Per-byte loop because `String.fromCharCode(...bytes)` blows the stack on large
 * inputs. Ours are 91 bytes max, but the loop is free.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Tolerates the missing padding. Throws if the input isn't valid base64. */
export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}
