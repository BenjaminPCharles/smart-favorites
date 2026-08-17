import { colors, fontSizes, radius, spacing } from '../../theme'

interface InputProps {
  value: string
  /** Gets the value, not the event. Same plain-props style as Button. */
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  isInvalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
  multiline?: boolean
  rows?: number
}

const baseStyle: React.CSSProperties = {
  width: '100%',
  padding: `${spacing.xs}px ${spacing.sm}px`,
  background: colors.bgElevated,
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: radius.sm,
  fontSize: fontSizes.md,
  color: colors.textPrimary,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const invalidStyle: React.CSSProperties = {
  borderColor: colors.danger,
}

const disabledStyle: React.CSSProperties = {
  opacity: 0.35,
  cursor: 'not-allowed',
}

export function Input({
  value,
  onChange,
  placeholder,
  ariaLabel,
  isInvalid = false,
  disabled = false,
  autoFocus = false,
  multiline = false,
  rows = 3,
}: InputProps): React.ReactNode {
  const style: React.CSSProperties = {
    ...baseStyle,
    ...(isInvalid ? invalidStyle : {}),
    ...(disabled ? disabledStyle : {}),
    ...(multiline ? { resize: 'vertical', lineHeight: 1.6 } : {}),
  }

  // No autocomplete, capitalisation or spellcheck on recovery words. The browser
  // guessing at them is worse than useless
  const sharedProps = {
    value,
    placeholder,
    disabled,
    autoFocus,
    style,
    'aria-label': ariaLabel,
    'aria-invalid': isInvalid,
    'autoComplete': 'off' as const,
    'autoCapitalize': 'off' as const,
    'autoCorrect': 'off' as const,
    'spellCheck': false,
  }

  if (multiline) {
    return (
      <textarea
        {...sharedProps}
        rows={rows}
        onChange={event => onChange(event.target.value)}
      />
    )
  }

  return (
    <input
      {...sharedProps}
      type="text"
      onChange={event => onChange(event.target.value)}
    />
  )
}
