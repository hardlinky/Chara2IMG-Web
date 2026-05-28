import { z } from "zod";

export const backupPinnedImageRequestSchema = z.object({
  clientId: z.string().min(1).max(128).optional(),
  jobId: z.string().min(1),
  outputIndex: z.number().int().nonnegative(),
  dataUrl: z.string().min(1),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"])
});

export const releasePinnedImageRequestSchema = z.object({
  clientId: z.string().min(1).max(128).optional(),
  jobId: z.string().min(1),
  outputIndex: z.number().int().nonnegative(),
  imageUrl: z.string().min(1)
});

export const reconcilePinnedImagesRequestSchema = z.object({
  clientId: z.string().min(1).max(128).optional(),
  refs: z.array(
    z.object({
      jobId: z.string().min(1),
      outputIndex: z.number().int().nonnegative(),
      imageUrl: z.string().min(1)
    })
  )
});
