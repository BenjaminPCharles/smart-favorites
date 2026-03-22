import { colors, fontSizes } from '../../theme'

type TypographyVariant = 'body' | 'secondary' | 'muted' | 'dim' | 'caption' | 'code'

interface TypographyProps {
  children: React.ReactNode
  variant?: TypographyVariant
  style?: React.CSSProperties
}

const variantStyles: Record<TypographyVariant, React.CSSProperties> = {
  // Standard text
  body: {
    fontSize: fontSizes.base,
    color: colors.textPrimary,
    lineHeight: 1.5,
  },
  // Slightly dimmed secondary text
  secondary: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    lineHeight: 1.5,
  },
  // Helper / warning text
  muted: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    lineHeight: 1.6,
  },
  // Very dimmed, for metadata
  dim: {
    fontSize: fontSizes.sm,
    color: colors.textDim,
    lineHeight: 1.5,
  },
  // Tiny label (badge, timestamp)
  caption: {
    fontSize: fontSizes.xs,
    color: colors.textDim,
    lineHeight: 1.4,
  },
  // Key / value display, monospace
  code: {
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
    lineHeight: 1.5,
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  },
}

const baseStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
}

export function Typography({ children, variant = 'body', style }: TypographyProps): React.ReactNode {
  return (
    <p style={{ ...baseStyle, ...variantStyles[variant], ...style }}>
      {children}
    </p>
  )
}
