import { z } from "zod";

export const verifyAdminKeyRequestSchema = z.object({
  key: z.string().min(1).max(256)
});
