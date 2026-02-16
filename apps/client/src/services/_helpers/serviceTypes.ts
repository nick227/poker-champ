export type ServiceResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        message: string;
        code?: string;
        status?: number;
        details?: any;
        ux?: { kind: "toast" | "redirect" | "focus" | "silent"; message?: string; to?: string; target?: string };
      };
    };

export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export function fail(
  message: string,
  opts: {
    code?: string;
    status?: number;
    details?: any;
    ux?: { kind: "toast" | "redirect" | "focus" | "silent"; message?: string; to?: string; target?: string };
  } = {},
): ServiceResult<never> {
  return { ok: false, error: { message, ...opts } };
}
