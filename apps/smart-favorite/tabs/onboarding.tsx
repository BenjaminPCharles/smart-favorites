import { Onboarding } from '~components/auth/onboarding/Onboarding'
import { colors, spacing } from '~theme'

/**
 * A tab, because a popup dies on blur and the natural thing to do after seeing 12
 * words is open a password manager. The alternative was persisting the plaintext
 * phrase to storage.session, which is what this redesign exists to stop doing.
 */

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    margin: 0,
    background: colors.bg,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: `${spacing.xl * 2}px ${spacing.lg}px`,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: 460,
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    overflow: 'hidden',
  },
}

function OnboardingTab(): React.ReactNode {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* The popup picks the account up via storage.onChanged, nothing to hand
            back from here */}
        <Onboarding onCreated={() => undefined} />
      </div>
    </div>
  )
}

export default OnboardingTab
