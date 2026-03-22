import { useState } from 'react'
import { Button } from '~components/shared/Button'
import { colors, spacing } from '~theme'

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'stretch',
    gap: spacing.sm,
    padding: `${spacing.lg}px ${spacing.xl}px ${spacing.md}px`,
    borderBottom: `1px solid ${colors.border}`,
  },
}

export function SearchFavorite(): React.ReactNode {
  const [_search, setSearch] = useState('')

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>): void {
    setSearch(e.target.value)
  }

  function handleSearchClick(): void {
    // Send request to backend
  }

  return (
    <div style={styles.container}>
      <input type="text" placeholder="Search in favorites" onChange={handleSearch} />
      <Button variant="primary" onClick={handleSearchClick}>→</Button>
    </div>
  )
}
