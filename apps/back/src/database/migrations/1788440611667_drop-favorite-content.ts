import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Drops favorite.content, a second copy of the text favorite_chunk.content already holds.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('favorite', ['content'])
}

/**
 * Restores the column empty, its data having gone with the drop.
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('favorite', {
    content: { type: 'text', notNull: false },
  })
}
