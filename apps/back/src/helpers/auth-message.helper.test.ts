import { describe, expect, it } from 'vitest'
import { accountCreateMessage, deviceRegisterMessage, sessionMessage } from './auth-message.helper'

/**
 * These three literals are the client/server contract. The extension asserts the
 * exact same strings in
 * apps/smart-favorite/helpers/crypto/signed-message.helper.test.ts — change one
 * side and that side's test still passes while production returns a uniform 401.
 * Both tests must be edited together, deliberately.
 */
const MASTER = 'bWFzdGVyLXB1YmxpYy1rZXk'
const DEVICE = 'ZGV2aWNlLXB1YmxpYy1rZXk'
const NONCE = 'bm9uY2U'

describe('auth-message.helper', () => {
  it('builds the account-create golden vector', () => {
    expect(accountCreateMessage(MASTER, DEVICE).toString('utf8'))
      .toBe('smart-favorites:v1:account-create:bWFzdGVyLXB1YmxpYy1rZXk:ZGV2aWNlLXB1YmxpYy1rZXk')
  })

  it('builds the session golden vector', () => {
    expect(sessionMessage(DEVICE, NONCE).toString('utf8'))
      .toBe('smart-favorites:v1:session:ZGV2aWNlLXB1YmxpYy1rZXk:bm9uY2U')
  })

  it('builds the device-register golden vector', () => {
    expect(deviceRegisterMessage(MASTER, DEVICE, NONCE).toString('utf8'))
      .toBe('smart-favorites:v1:device-register:bWFzdGVyLXB1YmxpYy1rZXk:ZGV2aWNlLXB1YmxpYy1rZXk:bm9uY2U')
  })

  it('separates domains: the same parts under two usages give different messages', () => {
    expect(sessionMessage(DEVICE, NONCE).equals(accountCreateMessage(DEVICE, NONCE))).toBe(false)
  })

  it('keeps part boundaries unambiguous', () => {
    expect(sessionMessage('a', 'bc').equals(sessionMessage('ab', 'c'))).toBe(false)
  })
})
