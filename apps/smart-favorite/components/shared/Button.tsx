import { colors, gradients, radius, shadows } from '../../theme'
import '../../style.css'

type ButtonVariant = 'ghost' | 'primary'

interface ButtonProps {
  children: React.ReactNode
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  variant?: ButtonVariant
  disabled?: boolean
  fullWidth?: boolean
}

const baseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  lineHeight: 1,
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  ghost: {
    width: '100%',
    padding: '10px 0',
    background: 'transparent',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.md,
    fontSize: 13,
    fontWeight: 500,
    color: colors.accent,
    gap: 6,
  },
  primary: {
    padding: '10px 12px',
    background: gradients.accentBtn,
    borderRadius: radius.sm,
    fontSize: 12,
    fontWeight: 600,
    color: colors.bg,
    boxShadow: shadows.accentMd,
  },
}

const disabledStyle: React.CSSProperties = {
  opacity: 0.35,
  cursor: 'not-allowed',
  pointerEvents: 'none',
}

export function Button({ children, onClick, variant = 'ghost', disabled = false, fullWidth = false }: ButtonProps): React.ReactNode {
  const style: React.CSSProperties = {
    ...baseStyle,
    ...variantStyles[variant],
    ...(fullWidth ? { width: '100%' } : {}),
    ...(disabled ? disabledStyle : {}),
  }

  return (
    <button
      className={variant === 'ghost' ? 'btn-add' : 'btn-search'}
      style={style}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
