import { Button } from '~components/shared/Button'
import { Typography } from '~components/shared/Typography'
import { spacing } from '~theme'

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: `${spacing.md}px ${spacing.xl}px ${spacing.lg}px`,
  },
}

interface WelcomeProps {
  onCreateAccountClick: () => void
  onRestoreClick: () => void
}

/**
 * Both buttons always show, never branched on stored state. Recovery needs nothing
 * local, so if the write after /auth/init got lost the worst case is the user takes
 * the second button instead of the first, which works.
 */
export function Welcome({ onCreateAccountClick, onRestoreClick }: WelcomeProps): React.ReactNode {
  return (
    <div style={styles.container}>
      <Typography variant="body">Smart Favorites</Typography>
      <Typography variant="helper">
        No email, no password. Your account is a 12-word recovery phrase that never leaves
        this device.
      </Typography>

      <Button variant="primary" fullWidth onClick={onCreateAccountClick}>
        → Create an account
      </Button>
      <Button onClick={onRestoreClick}>I have a recovery phrase</Button>
    </div>
  )
}
