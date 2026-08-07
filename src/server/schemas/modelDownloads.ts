import { z } from "zod";

export const enqueueDownloadSchema = z.object({
  url: z.string().url().max(2048),
  destPath: z.string().min(1).max(512),
  civitaiApiKey: z.string().max(512).optional(),
  huggingfaceApiKey: z.string().max(512).optional(),
});
