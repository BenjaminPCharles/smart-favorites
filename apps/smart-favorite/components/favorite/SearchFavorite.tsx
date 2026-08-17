import { useState } from 'react'
import { Button } from '~components/shared/Button'
import { colors, spacing } from '~theme'

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: `${spacing.lg}px ${spacing.xl}px ${spacing.md}px`,
    borderBottom: `1px solid ${colors.border}`,
  },
  input: {
    flex: 1,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: 4,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
  },
}

export function SearchFavorite(): React.ReactNode {
  const [_search, setSearch] = useState('')

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>): void {
    setSearch(e.target.value)
  }

  function handleSearchClick(): void {
    // TODO: hook this up to the real search endpoint
  }

  return (
    <div style={styles.container}>
      <input style={styles.input} type="text" placeholder="Search in favorites" onChange={handleSearch} />
      <Button variant="primary" onClick={handleSearchClick}>→</Button>
    </div>
  )
}
