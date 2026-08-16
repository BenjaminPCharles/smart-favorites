/**
 * Encode bytes as unpadded base64url. `btoa` is the only base64 primitive
 * available here — there is no Buffer in a browser bundle.
 *
 * The per-byte loop is deliberate: `String.fromCharCode(...bytes)` blows the call
 * stack on large inputs. Ours are at most 91 bytes, but the loop costs nothing and
 * needs no caveat.
 * @param bytes
 * @return {string}
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decode a base64url string, tolerating the missing padding.
 * @param value
 * @return {Uint8Array}
 * @throws {Error} when the input is not valid base64
 */
export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}
