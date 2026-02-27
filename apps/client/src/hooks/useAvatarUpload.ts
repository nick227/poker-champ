import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import { launchImageLibraryAsync } from "expo-image-picker";
import { uploadAvatar, type AvatarUploadResult } from "@/services/profileAvatar";
import { useToastStore } from "@/stores/toast.store";

function uriToJpegFile(uri: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", uri, true);
    xhr.responseType = "blob";
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const blob = xhr.response as Blob;
        resolve(new File([blob], "image.jpg", { type: "image/jpeg" }));
      } else {
        reject(new Error(`Failed to read image URI: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Failed to read image URI"));
    xhr.send();
  });
}

export function useAvatarUpload(opts: { onSuccess?: (result: AvatarUploadResult) => void }) {
  const [uploading, setUploading] = useState(false);
  const toast = useToastStore();
  const onSuccessRef = useRef(opts.onSuccess);
  onSuccessRef.current = opts.onSuccess;

  const uploadFile = useCallback(
    async (file: File | Blob) => {
      setUploading(true);
      try {
        const result = await uploadAvatar(file);
        if (result.ok) {
          onSuccessRef.current?.(result.data);
          toast.show("Avatar updated", "success");
        } else {
          toast.show(result.error.message ?? "Upload failed", "danger");
        }
      } catch {
        toast.show("Upload failed", "danger");
      } finally {
        setUploading(false);
      }
    },
    [toast],
  );

  const pickAndUpload = useCallback(async () => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp";
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) uploadFile(file);
      };
      input.click();
      return;
    }
    const result = await launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]) return;
    const file = await uriToJpegFile(result.assets[0].uri);
    await uploadFile(file);
  }, [uploadFile]);

  return { pickAndUpload, uploadFile, uploading };
}
