import { colors, fontSizes, radius, spacing } from '../../theme'

type CalloutVariant = 'warning' | 'danger'

interface CalloutProps {
  children: React.ReactNode
  variant?: CalloutVariant
}

const baseStyle: React.CSSProperties = {
  margin: 0,
  padding: `${spacing.xs}px ${spacing.sm}px`,
  borderRadius: radius.sm,
  fontSize: fontSizes.sm,
  lineHeight: 1.6,
  borderWidth: 1,
  borderStyle: 'solid',
}

const variantStyles: Record<CalloutVariant, React.CSSProperties> = {
  warning: {
    background: colors.warningBg,
    borderColor: colors.accentDark,
    color: colors.accent,
  },
  danger: {
    background: colors.dangerBg,
    borderColor: colors.danger,
    color: colors.danger,
  },
}

export function Callout({ children, variant = 'warning' }: CalloutProps): React.ReactNode {
  return (
    <p style={{ ...baseStyle, ...variantStyles[variant] }} role={variant === 'danger' ? 'alert' : undefined}>
      {children}
    </p>
  )
}
