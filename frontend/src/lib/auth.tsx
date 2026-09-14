import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiLogin, setToken, getToken } from "./api";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sur une recharge de page, on ne restaure l'utilisateur que si le jeton
    // stocke est encore valide (non expire). Sinon on repart proprement sur
    // l'ecran de connexion, sans tromper l'utilisateur avec une session fantome.
    const token = getToken();
    const stored = localStorage.getItem("ram_user");
    if (token && stored && !isTokenExpired(token)) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        /* ignore */
      }
    } else {
      // Nettoyage d'une session expirée ou incohérente.
      if (!token || !stored) {
        localStorage.removeItem("ram_user");
        if (!token) setToken(null);
      }
    }
    setLoading(false);

    const onUnauthorized = () => {
      localStorage.removeItem("ram_user");
      setUser(null);
    };
    window.addEventListener("ram-unauthorized", onUnauthorized);
    return () => window.removeEventListener("ram-unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiLogin<{ access_token: string; token_type: string; user: User }>(
      "/auth/login",
      { username, password },
    );
    setToken(data.access_token);
    localStorage.setItem("ram_user", JSON.stringify(data.user));
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem("ram_user");
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * Décode la partie "payload" d'un JWT (base64url) sans vérifier la signature.
 * Permet de lire la date d'expiration côté client avant d'émettre une requête.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const [, payloadPart] = token.split(".");
    if (!payloadPart) return true;
    // base64url -> base64 (paddé en multiple de 4) avant de décoder via atob.
    let base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    base64 += "=".repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== "number") return true;
    // Marge de 10 secondes pour éviter les courses en bord de limite.
    return payload.exp * 1000 <= Date.now() + 10_000;
  } catch {
    return true;
  }
}

export { getToken };
