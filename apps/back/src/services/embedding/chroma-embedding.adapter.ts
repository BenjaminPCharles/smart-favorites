import type { EmbeddingFunction } from 'chromadb'
import type { EmbeddingService } from './embedding.service'

export class ChromaEmbeddingAdapter implements EmbeddingFunction {
  public readonly name = 'HuggingFaceEmbedding'

  constructor(private readonly embeddingService: EmbeddingService) {}

  async generate(texts: string[]): Promise<number[][]> {
    const embeddings = await Promise.all(
      texts.map(text => this.embeddingService.embed(text)),
    )
    return embeddings
  }
}
