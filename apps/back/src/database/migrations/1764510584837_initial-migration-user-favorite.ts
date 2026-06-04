import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Create table
 * @param pgm
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  /**
   * User
   */
  pgm.createTable('user', {
    id: 'id',
    publicId: {
      type: 'uuid',
      notNull: true,
      unique: true,
      default: pgm.func('gen_random_uuid()'),
    },
    secretHash: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('user', 'publicId')

  /**
   * Favorite Type enum
   * developer: GitHub, docs, Stack Overflow, APIs, libraries, frameworks
   * security: CTF, penetration testing, CVEs, offensive/defensive security, bug bounty
   * design: Figma, UI/UX inspiration, icons, fonts, color palettes
   * tools: online utilities, converters, generators, dev tools
   * learning: courses, tutorials, documentation, books, technical articles
   * news: tech news, blogs, newsletters, industry feeds
   * entertainment: YouTube, Twitch, Reddit, music, gaming, leisure
   */
  pgm.createType('favorite_category', ['developer', 'security', 'design', 'tools', 'learning', 'news', 'entertainment'])

  /**
   * Favorite
   */
  pgm.createTable('favorite', {
    id: 'id',
    uuid: { type: 'uuid', notNull: true, unique: true, default: pgm.func('gen_random_uuid()') },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    url: { type: 'text', notNull: true },
    title: { type: 'text', notNull: true },
    description: { type: 'text', notNull: false },
    category: { type: 'favorite_category', notNull: true },
    user_id: { type: 'integer', notNull: true, references: '"user"', referencesConstraintName: 'fk_favorite_user' },
  })
  pgm.createIndex('favorite', 'user_id')
}

/**
 * Remove table and type
 * @param pgm
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('favorite', { ifExists: true })
  pgm.dropType('favorite_category', { ifExists: true })
  pgm.dropTable('user', { ifExists: true })
}
