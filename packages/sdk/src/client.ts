import { getApiBaseUrl, getAuthToken } from "./context";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: any;

  constructor(message: string, opts: { status: number; code?: string; details?: any }) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }
}

type RequestOptions = {
  baseUrl?: string;
  token?: string | null;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  bodyFormat?: "json" | "raw";
};

function joinUrl(baseUrl: string, path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${p}`;
}

function withQuery(url: string, query?: Record<string, string | number | boolean | null | undefined>) {
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function request<T>(
  method: string,
  path: string,
  body?: any,
  opts: RequestOptions = {}
): Promise<T> {
  const baseUrl = opts.baseUrl ?? getApiBaseUrl();
  if (!baseUrl) throw new ApiError("SDK base URL is not configured", { status: 0, code: "SDK_NOT_CONFIGURED" });

  const token = typeof opts.token !== "undefined" ? opts.token : getAuthToken();

  const bodyFormat = opts.bodyFormat ?? "json";
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (bodyFormat === "json" && !("Content-Type" in headers)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(withQuery(joinUrl(baseUrl, path), opts.query), {
      method,
      headers,
      body:
        typeof body === "undefined"
          ? undefined
          : bodyFormat === "json"
            ? JSON.stringify(body)
            : body,
    });

    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");

    if (!res.ok) {
      const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
      const code = payload?.code ?? payload?.error?.code;
      const message = payload?.message ?? payload?.error?.message ?? payload?.error ?? `HTTP ${res.status}`;
      throw new ApiError(message, { status: res.status, code, details: payload });
    }

    if (res.status == 204) return undefined as unknown as T;
    return (isJson ? await res.json() : (await res.text())) as unknown as T;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err?.message ?? "Network error", { status: 0, code: "NETWORK_ERROR", details: { cause: String(err) } });
  }
}
