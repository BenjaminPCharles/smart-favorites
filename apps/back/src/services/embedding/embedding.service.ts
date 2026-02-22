import type { FeatureExtractionPipeline } from '@huggingface/transformers'
import { pipeline } from '@huggingface/transformers'

export class EmbeddingService {
  private classifierPromise?: Promise<FeatureExtractionPipeline>

  constructor() {}

  /**
   * Embed the text
   * @param text - The text to embed
   */
  public async embed(text: string): Promise<number[]> {
    try {
      const extractor = await this.getExtractor()
      const result = await extractor(text, { pooling: 'mean', normalize: true })
      return Array.from(result.data)
    }
    catch (error) {
      console.error(`Error embedding text: ${error}`)
      throw error
    }
  }

  /**
   * Get the feature extraction pipeline used to embed the text
   * @returns The feature extraction pipeline
   */
  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.classifierPromise) {
      this.classifierPromise = pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
      )
    }
    return this.classifierPromise
  }
}
