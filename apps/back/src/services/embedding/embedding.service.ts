import process from 'node:process'
import { HfInference } from '@huggingface/inference'

export class EmbeddingService {
  private hf: HfInference

  constructor() {
    this.hf = new HfInference(process.env.HF_TOKEN)
  }

  public async embed(text: string): Promise<number[]> {
    try {
      const result = await this.hf.featureExtraction({
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
