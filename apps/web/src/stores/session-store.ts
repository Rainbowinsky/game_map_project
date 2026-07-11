import { create } from 'zustand';
import { authResponseSchema, type AuthResponse } from '@fantasy-map/validation';

const storageKey = 'atlas-session-v1';

function readSession(): AuthResponse | null {
  try {
    const value = sessionStorage.getItem(storageKey);
    if (!value) return null;
    const result = authResponseSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
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
    sessionStorage.setItem(storageKey, JSON.stringify(validated));
    set({ session: validated });
  },
  clearSession: () => {
    sessionStorage.removeItem(storageKey);
    set({ session: null });
  },
}));
