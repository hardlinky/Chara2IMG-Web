import { timingSafeEqual } from "node:crypto";

function toBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

export function verifyInviteSecret(providedInvite: string, expectedInvite: string): boolean {
  const provided = toBuffer(providedInvite);
  const expected = toBuffer(expectedInvite);

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}
