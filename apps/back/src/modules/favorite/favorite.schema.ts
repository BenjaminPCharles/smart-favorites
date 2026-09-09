import { z } from 'zod'

const savableUrl = z.url({ protocol: /^https?$/ }).max(2048)

export const favoriteSchema = z.object({
  url: savableUrl,
  title: z.string().min(1).max(512),
  content: z.string().max(20_000).nullable(),
})
export type Favorite = z.infer<typeof favoriteSchema>

export const favoriteLookupSchema = z.object({
  url: savableUrl,
})
