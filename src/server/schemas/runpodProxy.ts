import { z } from "zod";

const commonSchema = {
  endpointId: z.string().trim().min(1).max(128),
  apiKey: z.string().trim().min(1).max(512)
};

export const runRequestSchema = z
  .object({
    ...commonSchema,
    input: z.record(z.string(), z.unknown())
  })
  .strict();

export const statusRequestSchema = z
  .object({
    ...commonSchema,
    id: z.string().trim().min(1).max(128)
  })
  .strict();

export const cancelRequestSchema = z
  .object({
    ...commonSchema,
    id: z.string().trim().min(1).max(128)
  })
  .strict();

export const retryRequestSchema = z
  .object({
    ...commonSchema,
    id: z.string().trim().min(1).max(128)
  })
  .strict();

export const purgeQueueRequestSchema = z.object(commonSchema).strict();
