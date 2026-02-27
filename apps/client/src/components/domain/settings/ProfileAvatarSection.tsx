import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { AvatarImage } from "@/components/base/AvatarImage";
import { deleteAvatar } from "@/services/profileAvatar";
import { useToastStore } from "@/stores/toast.store";
import { useAvatarUpload } from "@/hooks/useAvatarUpload";

const AVATAR_SIZE = 80;

export type ProfileAvatarSectionProps = {
  avatarUrl?: string | null;
  username?: string;
  onUpdate: () => void;
};

export function ProfileAvatarSection({ avatarUrl, username, onUpdate }: ProfileAvatarSectionProps) {
  const [removing, setRemoving] = useState(false);
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null | undefined>(avatarUrl);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToastStore();
  const { pickAndUpload, uploadFile, uploading } = useAvatarUpload({
    onSuccess: (result) => {
      setLocalAvatarUrl(result.avatarUrl);
      onUpdate();
    },
  });
  const busy = uploading || removing;

  const handlePickFile = () => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      fileInputRef.current?.click();
      return;
    }
    pickAndUpload();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadFile(file);
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await deleteAvatar();
      if (res.ok) {
        setLocalAvatarUrl(null);
        onUpdate();
        toast.show("Avatar removed", "success");
      } else {
        toast.show(res.error.message ?? "Remove failed", "danger");
      }
    } catch {
      toast.show("Remove failed", "danger");
    } finally {
      setRemoving(false);
    }
  };

  useEffect(() => {
    setLocalAvatarUrl(avatarUrl);
  }, [avatarUrl]);

  const initial = username?.slice(0, 1).toUpperCase() ?? "?";

  return (
    <View className="ui-surface-card ui-p-4 ui-stack-3">
      <Text variant="label">Avatar</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <AvatarImage
          avatarUrl={busy ? null : localAvatarUrl}
          initial={busy ? "…" : initial}
          onPress={busy ? undefined : handlePickFile}
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
            overflow: "hidden",
            backgroundColor: "var(--c-panel-elevated, #333)",
            borderWidth: 1,
            borderColor: "var(--c-border, #555)",
            justifyContent: "center",
            alignItems: "center",
          }}
          imageStyle={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
          }}
        />
        <View style={{ flex: 1, gap: 8 }}>
          <Button
            title={removing ? "Removing…" : uploading ? "Uploading…" : "Change photo"}
            variant="ghost"
            onPress={handlePickFile}
            disabled={busy}
          />
          {avatarUrl ? (
            <Button title="Remove" variant="ghost" onPress={handleRemove} disabled={busy} />
          ) : null}
        </View>
      </View>
      {Platform.OS === "web" ? (
        <input
          ref={fileInputRef as React.RefObject<HTMLInputElement>}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      ) : null}
    </View>
  );
}
