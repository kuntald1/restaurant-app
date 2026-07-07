// src/api/client.ts
const BASE_URL = "https://currycloud.mooo.com";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      const raw = body?.detail ?? body?.message;
      if (typeof raw === "string") {
        detail = raw;
      } else if (Array.isArray(raw)) {
        // FastAPI validation errors: [{loc, msg, type}, ...]
        detail = raw
          .map((e: any) => {
            const field = Array.isArray(e?.loc) ? e.loc.join(".") : e?.loc;
            return field ? `${field}: ${e?.msg}` : e?.msg ?? JSON.stringify(e);
          })
          .join("; ");
      } else if (raw && typeof raw === "object") {
        detail = raw.msg ?? JSON.stringify(raw);
      }
    } catch {
      // response wasn't JSON, keep statusText
    }
    throw new ApiError(detail, res.status);
  }

  // some endpoints (e.g. PATCH notes) return small JSON acks; 204s return nothing
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { BASE_URL };
