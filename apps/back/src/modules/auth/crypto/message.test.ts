import { describe, expect, it } from 'vitest'
import { accountCreateMessage, deviceRegisterMessage, sessionMessage } from './message'

/**
 * The client/server contract. The extension asserts the same strings in
 * signed-message.helper.test.ts. Change one side and its test still goes green
 * while prod 401s, so edit both or neither.
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
