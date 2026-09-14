const BASE = import.meta.env.VITE_API_URL || "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem("ram_token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("ram_token", token);
  else localStorage.removeItem("ram_token");
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event("ram-unauthorized"));
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? data);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return res as unknown as T;
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPut = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const apiDelete = <T>(path: string) => api<T>(path, { method: "DELETE" });

// Connexion : ne doit PAS déclencher la déconnexion globale en cas de 401
// (un mauvais mot de passe renvoie 401 et ne signifie pas "session expirée").
export async function apiLogin<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? data);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export async function downloadDashboardPdf(): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}/dashboard/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let detail = "Erreur lors de l'export PDF";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rapport_dashboard_RAM_${Date.now()}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importFlightExcel<T>(file: File): Promise<T> {
  const token = getToken();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/flights/import`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    let detail = "Erreur lors de l'import";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export interface ChatStreamHandlers {
  onToken: (token: string) => void;
  onDone?: (stats: { doneReason: string; evalCount: number; evalDurationNs: number }) => void;
}

// Consomme le flux SSE de /chatbot/stream et appelle onToken a chaque morceau.
// Permet d'afficher la reponse des le premier jeton au lieu d'attendre la fin
// complete de la generation.
export async function streamChat(
  messages: { role: string; content: string }[],
  handlers: ChatStreamHandlers,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}/chatbot/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
  });

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event("ram-unauthorized"));
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? data);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (!res.body) throw new ApiError(500, "Flux de reponse indisponible");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Les evenements SSE sont separes par une ligne vide.
    let separator = buffer.indexOf("\n\n");
    while (separator !== -1) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (dataLine) {
        const payload = dataLine.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const parsed = JSON.parse(payload) as {
            token?: string;
            error?: string;
            done?: boolean;
            done_reason?: string;
            eval_count?: number;
            eval_duration?: number;
          };
          if (parsed.error) throw new ApiError(502, parsed.error);
          if (parsed.token) handlers.onToken(parsed.token);
          if (parsed.done) {
            handlers.onDone?.({
              doneReason: parsed.done_reason ?? "",
              evalCount: parsed.eval_count ?? 0,
              evalDurationNs: parsed.eval_duration ?? 0,
            });
          }
        } catch (e) {
          if (e instanceof ApiError) throw e;
          /* trame illisible : on l'ignore */
        }
      }
      separator = buffer.indexOf("\n\n");
    }
  }
}
