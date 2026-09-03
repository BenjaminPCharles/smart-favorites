import process from 'node:process'
import { InferenceClient } from '@huggingface/inference'

let client: InferenceClient | null = null

/** Unset in tests and in any deployment that has not been given a token yet. */
export function isEmbeddingEnabled(): boolean {
  return Boolean(process.env.HF_TOKEN)
}

/** Lazy: at import time dotenvx has not populated HF_TOKEN yet. */
function getClient(): InferenceClient {
  client ??= new InferenceClient(process.env.HF_TOKEN)
  return client
}

/** 384 floats, the dimension favorite_chunk.embedding is declared with. Throws: the caller decides the cost. */
export async function embed(text: string): Promise<number[]> {
  const result = await getClient().featureExtraction({
    // Pinned: `auto` routes to whichever provider is first for the account, and only hf-inference serves this pipeline.
    provider: 'hf-inference',
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    inputs: text,
  })

  return result as number[]
}
