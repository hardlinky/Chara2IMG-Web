import { z } from "zod";

export const verifyInviteSchema = z
  .object({
    invite: z.string().trim().min(1).max(256)
  })
  .strict();
