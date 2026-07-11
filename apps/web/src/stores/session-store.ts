import { create } from 'zustand';
import { authResponseSchema, type AuthResponse } from '@fantasy-map/validation';
import { z } from 'zod';

const storageKey = 'atlas-session-v1';

const storedSessionSchema = z
  .object({
    version: z.literal(2),
    session: authResponseSchema,
    expiresAt: z.number().int().positive(),
  })
  .strict();

interface StoredSession {
  readonly version: 2;
  readonly session: AuthResponse;
  readonly expiresAt: number;
}

function tokenExpiration(accessToken: string): number | null {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const parsed: unknown = JSON.parse(atob(normalized));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'exp' in parsed &&
      typeof parsed.exp === 'number'
    ) {
      return parsed.exp * 1_000;
    }
  } catch {
    // Invalid legacy tokens are handled by the first authenticated request.
  }
  return null;
}

export function parseStoredSession(value: string, now = Date.now()): StoredSession | null {
  try {
    const json: unknown = JSON.parse(value);
    const stored = storedSessionSchema.safeParse(json);
    if (stored.success) return stored.data.expiresAt > now ? stored.data : null;

    const legacy = authResponseSchema.safeParse(json);
    if (!legacy.success) return null;
    const expiresAt =
      tokenExpiration(legacy.data.accessToken) ?? now + legacy.data.expiresIn * 1_000;
    return expiresAt > now ? { version: 2, session: legacy.data, expiresAt } : null;
  } catch {
    return null;
  }
}

function createStoredSession(session: AuthResponse, now = Date.now()): StoredSession {
  return { version: 2, session, expiresAt: now + session.expiresIn * 1_000 };
}

function readSession(): AuthResponse | null {
  try {
    const value = sessionStorage.getItem(storageKey);
    if (!value) return null;
    const stored = parseStoredSession(value);
    if (!stored) {
      sessionStorage.removeItem(storageKey);
      return null;
    }
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
    return stored.session;
  } catch {
    return null;
  }
}

interface SessionState {
  session: AuthResponse | null;
  setSession: (session: AuthResponse) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: readSession(),
  setSession: (session) => {
    const validated = authResponseSchema.parse(session);
    sessionStorage.setItem(storageKey, JSON.stringify(createStoredSession(validated)));
    set({ session: validated });
  },
  clearSession: () => {
    sessionStorage.removeItem(storageKey);
    set({ session: null });
  },
}));
