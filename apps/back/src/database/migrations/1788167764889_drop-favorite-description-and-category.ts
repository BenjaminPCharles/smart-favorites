import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * A favorite is url + title + scraped content: nothing classifies or summarises it yet.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('favorite', ['description', 'category'])

  pgm.dropType('favorite_category', { ifExists: true })
}

/**
 * Both come back nullable: the dropped values are gone, and `category` was NOT NULL.
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createType('favorite_category', [
    'developer',
    'security',
    'design',
    'tools',
    'learning',
    'news',
    'entertainment',
  ])

  pgm.addColumns('favorite', {
    description: { type: 'text', notNull: false },
    category: { type: 'favorite_category', notNull: false },
  })
}
