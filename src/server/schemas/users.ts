import { z } from "zod";

// Usernames: 1-32 chars, letters/digits/underscore/hyphen. Case-sensitive.
export const userLoginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Username may only contain letters, digits, _ and -"),
  password: z.string().min(1).max(200)
});
