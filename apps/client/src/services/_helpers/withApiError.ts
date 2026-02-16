import { ApiError } from "@poker-champ/sdk";
import { fail, ok, type ServiceResult } from "./serviceTypes";
import { resolveErrorUx } from "@/registry/error.registry";

export async function withApiError<T>(fn: () => Promise<T>): Promise<ServiceResult<T>> {
  try {
    const data = await fn();
    if (!data || typeof data !== "object") {
      throw new ApiError("Invalid response shape", {
        status: 500,
        code: "INVALID_RESPONSE",
        details: { payload: data },
      });
    }
    return ok(data);
  } catch (e: any) {
    const err = e as ApiError;
    return fail(err.message ?? "Request failed", {
      code: err.code,
      status: err.status,
      details: err.details,
      ux: resolveErrorUx(err.code, err.status),
    });
  }
}
