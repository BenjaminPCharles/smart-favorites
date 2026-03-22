/**
 * Check private key validity
 * @param privateKey
 * @return {{ isValid: true } | { isValid: false, errorMessage: string }}
 */
export function checkPrivateKeyValidity(privateKey: string): { isValid: true } | { isValid: false, errorMessage: string } {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const isValid = UUID_REGEX.test(privateKey)

  if (!isValid) {
    return {
      isValid: false,
      errorMessage: 'Private key is not a valid key',
    }
  }

  return { isValid: true }
}
