import { EmbeddingService } from '../services/embedding/embedding.service'
import { HttpService } from '../services/http/http.service'
import { ChromaConfig } from './chroma.config'
import { DatabaseConfig } from './database.config'

export class ServicesContainer {
  // Configs
  public readonly chromaConfig: ChromaConfig
  public readonly databaseConfig: DatabaseConfig
  public readonly scrapeDatabaseConfig: DatabaseConfig

  // Services
  public readonly httpService: HttpService
  public readonly embeddingService: EmbeddingService

  constructor() {
    // Services (EmbeddingService first, needed by ChromaConfig)
    this.httpService = new HttpService()
    this.embeddingService = new EmbeddingService()

    // Configs
    this.chromaConfig = new ChromaConfig(this.embeddingService)
    this.databaseConfig = new DatabaseConfig('SERVICE_DB')
    this.scrapeDatabaseConfig = new DatabaseConfig('SCRAPE_DB')
  }
}

export const servicesContainer = new ServicesContainer()
