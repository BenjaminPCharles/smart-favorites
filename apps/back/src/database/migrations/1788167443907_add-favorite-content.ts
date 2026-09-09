import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Adds the nullable favorite.content, the page text being optional.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('favorite', {
    content: {
      type: 'text',
      notNull: false,
    },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('favorite', ['content'])
}
