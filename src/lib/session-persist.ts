const STORAGE_KEY = "gbblox-auth.session";
const DEFAULT_TTL_MS = 60 * 60 * 24 * 60 * 1000;

export type PersistedSession = {
  token: string;
  userId: string;
  email: string;
  expiresAt: number;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function readPersistedSession(): PersistedSession | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    const userId = typeof parsed.userId === "string" ? parsed.userId : "";
    const email = typeof parsed.email === "string" ? parsed.email : "";
    const expiresAt = typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0;
    if (!token || expiresAt <= Date.now()) {
      clearPersistedSession();
      return null;
    }
    return { token, userId, email, expiresAt };
  } catch {
    clearPersistedSession();
    return null;
  }
}

export function clearPersistedSession(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function writePersistedSession(session: PersistedSession): PersistedSession {
  if (!canUseStorage()) return session;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore quota / private mode */
  }
  return session;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function expiresAtOf(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  return Date.now() + DEFAULT_TTL_MS;
}

/** Pull a persistable snapshot out of a Better Auth sign-in / get-session payload. */
export function sessionFromAuthPayload(payload: unknown): PersistedSession | null {
  const root = asRecord(payload);
  if (!root) return null;
  const nested = asRecord(root.data) ?? root;
  const session = asRecord(nested.session) ?? nested;
  const user = asRecord(nested.user) ?? asRecord(session.user);
  const token = String(nested.token ?? session.token ?? "").trim();
  if (!token) return null;
  const userId = String(user?.id ?? nested.userId ?? session.userId ?? "").trim();
  const email = String(user?.email ?? nested.email ?? "").trim();
  return {
    token,
    userId,
    email,
    expiresAt: expiresAtOf(session.expiresAt ?? nested.expiresAt),
  };
}

export function persistAuthPayload(payload: unknown): PersistedSession | null {
  const session = sessionFromAuthPayload(payload);
  if (!session) return null;
  return writePersistedSession(session);
}

export function persistedBearerToken(): string | null {
  return readPersistedSession()?.token ?? null;
}
