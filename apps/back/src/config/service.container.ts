import { EmbeddingService } from '../services/embedding/embedding.service'
import { HttpService } from '../services/http/http.service'
import { DatabaseConfig } from './database.config'
import { VectorChunkConfig } from './vector-chunk.config'

export class ServicesContainer {
  // Configs
  public readonly databaseConfig: DatabaseConfig
  public readonly scrapeDatabaseConfig: DatabaseConfig
  public readonly vectorChunk: VectorChunkConfig

  // Services
  public readonly httpService: HttpService
  public readonly embeddingService: EmbeddingService

  constructor() {
    // Services (EmbeddingService first, needed by ChromaConfig)
    this.httpService = new HttpService()
    this.embeddingService = new EmbeddingService()

    // Configs
    this.databaseConfig = new DatabaseConfig('SERVICE_DB')
    this.scrapeDatabaseConfig = new DatabaseConfig('SCRAPE_DB')
    this.vectorChunk = new VectorChunkConfig(this.databaseConfig, this.embeddingService)
  }
}

export const servicesContainer = new ServicesContainer()
