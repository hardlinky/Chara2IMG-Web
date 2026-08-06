import { z } from "zod";

export const createAlbumSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  jobId: z.string().min(1),
  imageIndex: z.number().int().nonnegative()
});

export const updateAlbumSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    isPublished: z.boolean().optional()
  })
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined || value.isPublished !== undefined,
    {
      message: "No fields to update"
    }
  );

export const addAlbumImageSchema = z.object({
  jobId: z.string().min(1),
  imageIndex: z.number().int().nonnegative()
});
