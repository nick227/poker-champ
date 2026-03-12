import { request } from "@poker-champ/sdk";
import { withApiError } from "./_helpers/withApiError";
import type { ServiceResult } from "./_helpers/serviceTypes";

type UpdateProfilePayload = {
  displayName: string;
};

type UpdateProfileResponse = {
  user: {
    id: string;
    email: string;
    displayName: string;
    username?: string | null;
  };
};

export async function postProfileDisplayName(
  displayName: string,
): Promise<ServiceResult<UpdateProfileResponse>> {
  return withApiError(() =>
    request<UpdateProfileResponse>("PATCH", "/api/profile", { displayName }),
  );
}

