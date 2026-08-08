import { describe, expect, it } from "vitest";
import { userLoginSchema } from "../../src/server/schemas/users";

describe("user login schema", () => {
  it("reserves the shared anonymous wallet identity", () => {
    for (const username of ["anon", "Anon", "ANON", "anonymous", "Anonymous", "ANONYMOUS"]) {
      expect(userLoginSchema.safeParse({ username, password: "secret" }).success).toBe(false);
    }
    expect(userLoginSchema.safeParse({ username: "artist", password: "secret" }).success).toBe(true);
  });
});