import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/** Nullable: the favorite is saved whether or not the extension managed to read the page. */
// Its own migration because the initial schema has already run, and a recorded one never replays
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
