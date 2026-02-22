/**
 * Service to fetch data from a URL
 * @param url - The URL to fetch data from
 * @param options - The options to fetch data from
 * @returns The fetched data
 */
export class HttpService {
  constructor() {}

  async fetch(url: string, options?: RequestInit): Promise<unknown> {
    try {
      const response = await fetch(url, options)
      if (!response.ok) {
        const body = await response.text()
        throw new Error(`Failed to fetch data from ${url}: ${response.status} ${response.statusText} - ${body}`)
      }
      return response.json()
    }
    catch (error) {
      console.error(`Error fetching data from ${url}:`, error)
      throw error
    }
  }
}
