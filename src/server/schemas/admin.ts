import { z } from "zod";

export const verifyAdminKeyRequestSchema = z.object({
  key: z.string().min(1).max(256)
});

export const impersonateRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Username may only contain letters, digits, _ and -")
});
