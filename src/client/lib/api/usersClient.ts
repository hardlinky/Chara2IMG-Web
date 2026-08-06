export type UserSession = {
  username: string | null;
};

export type UserLoginResult =
  | { ok: true; username: string; created: boolean }
  | { ok: false; error: string };

export async function getUserSession(): Promise<UserSession> {
  const res = await fetch("/api/users/session", { credentials: "include" });
  if (!res.ok) return { username: null };
  const data = (await res.json()) as { ok: boolean; username: string | null };
  return { username: data.username ?? null };
}

export async function loginUser(username: string, password: string): Promise<UserLoginResult> {
  const res = await fetch("/api/users/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; username?: string; created?: boolean; error?: string }
    | null;
  if (!res.ok || !data?.ok || !data.username) {
    return { ok: false, error: data?.error ?? "Login failed" };
  }
  return { ok: true, username: data.username, created: Boolean(data.created) };
}

export async function logoutUser(): Promise<void> {
  await fetch("/api/users/logout", { method: "POST", credentials: "include" });
}

// Admin-only: adopt an existing user's identity (requires admin session).
export async function impersonateUser(username: string): Promise<UserLoginResult> {
  const res = await fetch("/api/admin/impersonate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  });
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; username?: string; error?: string }
    | null;
  if (!res.ok || !data?.ok || !data.username) {
    return { ok: false, error: data?.error ?? "Impersonation failed" };
  }
  return { ok: true, username: data.username, created: false };
}
