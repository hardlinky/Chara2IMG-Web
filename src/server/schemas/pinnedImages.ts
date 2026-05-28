import { z } from "zod";

export const backupPinnedImageRequestSchema = z.object({
  jobId: z.string().min(1),
  outputIndex: z.number().int().nonnegative(),
  dataUrl: z.string().min(1),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"])
});
