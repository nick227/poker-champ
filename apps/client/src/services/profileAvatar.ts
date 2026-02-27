import { request } from "@poker-champ/sdk";
import { withApiError } from "./_helpers/withApiError";
import type { ServiceResult } from "./_helpers/serviceTypes";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type AvatarUploadResult = { avatarUrl: string | null; avatarVersion: number | null };
export type AvatarDeleteResult = { avatarUrl: null; avatarVersion: number | null };

export async function uploadAvatar(file: File | Blob): Promise<ServiceResult<AvatarUploadResult>> {
  return withApiError(async () => {
    if (file.size > MAX_SIZE_BYTES) {
      throw new Error("Image must be 5 MB or smaller");
    }
    const mime = file instanceof File ? file.type : "";
    if (mime && !ALLOWED_TYPES.includes(mime)) {
      throw new Error("Use JPEG, PNG, or WebP");
    }
    const form = new FormData();
    form.append("file", file, file instanceof File ? file.name : "image.jpg");
    return request<AvatarUploadResult>("POST", "/api/profile/avatar", form, { bodyFormat: "raw" });
  });
}

export async function deleteAvatar(): Promise<ServiceResult<AvatarDeleteResult>> {
  return withApiError(async () => {
    return request<AvatarDeleteResult>("DELETE", "/api/profile/avatar");
  });
}
