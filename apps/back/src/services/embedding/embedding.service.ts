import process from 'node:process'
import { InferenceClient } from '@huggingface/inference'

export class EmbeddingService {
  private hf: InferenceClient

  constructor() {
    this.hf = new InferenceClient(process.env.HF_TOKEN)
  }

  public async embed(text: string): Promise<number[]> {
    try {
      const result = await this.hf.featureExtraction({
        // Pinned: `auto` routes to whichever provider is first for the account,
        // and only hf-inference serves this model's feature-extraction pipeline.
        provider: 'hf-inference',
        model: 'sentence-transformers/all-MiniLM-L6-v2',
        inputs: text,
      })
      return result as number[]
    }
    catch (error) {
      console.error(`Error embedding text: ${error}`)
      throw error
    }
  }
}
