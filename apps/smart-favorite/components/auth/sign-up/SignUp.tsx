import browser from 'webextension-polyfill'
import { Button } from '~components/shared/Button'
import { Typography } from '~components/shared/Typography'
import { colors, spacing } from '~theme'

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: `${spacing.sm}px ${spacing.xl}px ${spacing.lg}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  checkBox: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    fontSize: 11,
    color: colors.textSecondary,
    cursor: 'pointer',
    userSelect: 'none',
  },
}

interface SignUpProps {
  privateKey: string
  hasAcceptTerms: boolean
  setHasAcceptTerms: React.Dispatch<React.SetStateAction<boolean>>
}
export function SignUp({ privateKey, hasAcceptTerms, setHasAcceptTerms }: SignUpProps): React.ReactNode {
  function handleAcceptTerms(): void {
    setHasAcceptTerms(prev => !prev)
  }
  function handleAcceptTermsClick(): void {
    if (hasAcceptTerms) {
      browser.storage.local.set({ private_key: privateKey })
    }
  }

  return (
    <div style={styles.container}>
      <Typography variant="code">{privateKey}</Typography>
      <Typography variant="muted">This key is the only way to recover your account. If you lose it, your favorites will be inaccessible.</Typography>
      <label style={styles.checkBox}>
        <input type="checkbox" onClick={handleAcceptTerms} />
        I have safely stored my key.
      </label>
      <Button variant="primary" fullWidth disabled={!hasAcceptTerms} onClick={handleAcceptTermsClick}>→ Sign up</Button>
    </div>
  )
}
