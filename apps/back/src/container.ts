import { EmbeddingService } from './modules/embedding/embedding.service'
import { VectorChunkRepository } from './modules/embedding/vector-chunk.repository'
import { DatabaseConfig } from './shared/config/database.config'
import { HttpService } from './shared/http/http.service'

export class ServicesContainer {
  // Infrastructure
  public readonly databaseConfig: DatabaseConfig
  public readonly httpService: HttpService

  // Modules
  public readonly embeddingService: EmbeddingService
  public readonly vectorChunk: VectorChunkRepository

  constructor() {
    this.databaseConfig = new DatabaseConfig('SERVICE_DB')
    this.httpService = new HttpService()

    // EmbeddingService first, VectorChunkRepository depends on it
    this.embeddingService = new EmbeddingService()
    this.vectorChunk = new VectorChunkRepository(this.databaseConfig, this.embeddingService)
  }
}

export const servicesContainer = new ServicesContainer()
