import type { Collection } from 'chromadb'
import type { EmbeddingService } from '../services/embedding/embedding.service'
import { ChromaClient } from 'chromadb'
import { ChromaEmbeddingAdapter } from '../services/embedding/chroma-embedding.adapter'

export class ChromaConfig {
  private client: ChromaClient
  private collectionCache: Collection | null = null
  private embeddingFunction: ChromaEmbeddingAdapter

  constructor(embeddingService: EmbeddingService) {
    this.client = new ChromaClient()
    this.embeddingFunction = new ChromaEmbeddingAdapter(embeddingService)
  }

  async getCollection(): Promise<Collection> {
    if (this.collectionCache) {
      return this.collectionCache
    }

    this.collectionCache = await this.client.getOrCreateCollection({
      name: 'chatbot-collection',
      embeddingFunction: this.embeddingFunction,
    })

    return this.collectionCache
  }

  async resetCollection(): Promise<void> {
    try {
      await this.client.deleteCollection({ name: 'chatbot-collection' })
    }
    catch {
      // Ignore - collection might not exist
    }
    this.collectionCache = null
  }
}
