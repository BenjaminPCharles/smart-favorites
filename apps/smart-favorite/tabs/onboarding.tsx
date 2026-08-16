import { Onboarding } from '~components/auth/onboarding/Onboarding'
import { colors, spacing } from '~theme'

/**
 * Onboarding runs in a tab, not in the popup.
 *
 * A popup's context is destroyed the moment it loses focus, and the natural next
 * action after being shown 12 words is to open a password manager — which would
 * destroy the phrase mid-flow. A tab survives that; closing it is a deliberate act.
 * It is also the right canvas for a 12-word grid, which 260px is not.
 *
 * The alternative would be persisting the plaintext phrase to storage.session for
 * the duration of onboarding, i.e. deliberately writing the recovery secret into an
 * extension-wide store — the one thing this redesign exists to stop doing.
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
        {/* The popup picks the account up through storage.onChanged, so there is
            nothing to hand back here */}
        <Onboarding onCreated={() => undefined} />
      </div>
    </div>
  )
}

export default OnboardingTab
