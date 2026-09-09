import process from 'node:process'
import { InferenceClient } from '@huggingface/inference'

let client: InferenceClient | null = null

/**
 * Unset in tests and in any deployment that has not been given a token yet.
 */
export function isEmbeddingEnabled(): boolean {
  return Boolean(process.env.HF_TOKEN)
}

/**
 * Lazy: at import time dotenvx has not populated HF_TOKEN yet.
 */
function getClient(): InferenceClient {
  client ??= new InferenceClient(process.env.HF_TOKEN)
  return client
}

/**
 * The 384 floats favorite_chunk.embedding expects, throwing so the caller decides the cost.
 */
export async function embed(text: string): Promise<number[]> {
  const result = await getClient().featureExtraction({
    provider: 'hf-inference',
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    inputs: text,
  })

  return result as number[]
}
