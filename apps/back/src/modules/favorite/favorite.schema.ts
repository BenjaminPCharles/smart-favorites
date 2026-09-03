import { z } from 'zod'

/** Unknown keys are stripped, so the extension can keep sending favIconUrl and lastAccessed. */
export const favoriteSchema = z.object({
  url: z.url(),
  title: z.string(),
  content: z.string().nullable(),
})
export type Favorite = z.infer<typeof favoriteSchema>
