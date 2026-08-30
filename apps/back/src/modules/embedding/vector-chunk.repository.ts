import type { DatabaseConfig } from '../../shared/config/database.config'
import type { EmbeddingService } from './embedding.service'

interface Chunk {
  id: number
  content: string
  metadata: Record<string, unknown> | null
}

// Every statement here targets a `chunks` table the migrations never create: the schema has `favorite_chunk`.
export class VectorChunkRepository {
  constructor(
    private readonly databaseConfig: DatabaseConfig,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async insert(content: string, metadata?: Record<string, unknown>): Promise<void> {
    const embedding = await this.embeddingService.embed(content)
    const pool = this.databaseConfig.getPool()
    await pool.query(
      'INSERT INTO chunks (content, metadata, embedding) VALUES ($1, $2, $3)',
      [content, metadata ?? null, JSON.stringify(embedding)],
    )
  }

  async search(query: string, limit = 5): Promise<Chunk[]> {
    const embedding = await this.embeddingService.embed(query)
    const pool = this.databaseConfig.getPool()
    const result = await pool.query<Chunk>(
      'SELECT id, content, metadata FROM chunks ORDER BY embedding <=> $1 LIMIT $2',
      [JSON.stringify(embedding), limit],
    )
    return result.rows
  }

  async reset(): Promise<void> {
    const pool = this.databaseConfig.getPool()
    await pool.query('TRUNCATE TABLE chunks')
  }
}
