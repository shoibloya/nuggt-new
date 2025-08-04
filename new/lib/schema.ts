import { z } from "zod"

/** GPT response → strict validation */
export const AnalysisSchema = z.object({
  productDescription: z.string(),
  icps: z.array(
    z.object({
      name: z.string(),
      problems: z.array(z.string()),
    }),
  ),
})

export type Analysis = z.infer<typeof AnalysisSchema>
