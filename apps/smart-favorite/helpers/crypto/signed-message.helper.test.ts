import { describe, expect, it } from 'vitest'
import { buildAccountCreateMessage, buildDeviceRegisterMessage, buildSessionMessage } from '~helpers/crypto/signed-message.helper'

/**
 * These three literals are the client/server contract. The server asserts the
 * exact same strings in apps/back/src/helpers/auth-message.helper.test.ts —
 * change one side and that side's test still passes while production returns a
 * uniform 401. Both tests must be edited together, deliberately.
 */
const MASTER = 'bWFzdGVyLXB1YmxpYy1rZXk'
const DEVICE = 'ZGV2aWNlLXB1YmxpYy1rZXk'
const NONCE = 'bm9uY2U'

const decoder = new TextDecoder()

describe('signed-message.helper', () => {
  it('builds the account-create golden vector', () => {
    expect(decoder.decode(buildAccountCreateMessage(MASTER, DEVICE)))
      .toBe('smart-favorites:v1:account-create:bWFzdGVyLXB1YmxpYy1rZXk:ZGV2aWNlLXB1YmxpYy1rZXk')
  })

  it('builds the session golden vector', () => {
    expect(decoder.decode(buildSessionMessage(DEVICE, NONCE)))
      .toBe('smart-favorites:v1:session:ZGV2aWNlLXB1YmxpYy1rZXk:bm9uY2U')
  })

  it('builds the device-register golden vector', () => {
    expect(decoder.decode(buildDeviceRegisterMessage(MASTER, DEVICE, NONCE)))
      .toBe('smart-favorites:v1:device-register:bWFzdGVyLXB1YmxpYy1rZXk:ZGV2aWNlLXB1YmxpYy1rZXk:bm9uY2U')
  })

  it('separates domains: the same parts under two usages give different messages', () => {
    expect(decoder.decode(buildSessionMessage(DEVICE, NONCE)))
      .not
      .toBe(decoder.decode(buildAccountCreateMessage(DEVICE, NONCE)))
  })

  it('keeps part boundaries unambiguous', () => {
    expect(decoder.decode(buildSessionMessage('a', 'bc')))
      .not
      .toBe(decoder.decode(buildSessionMessage('ab', 'c')))
  })
})
