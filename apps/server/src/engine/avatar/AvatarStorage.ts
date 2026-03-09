import path from "node:path";
import { promises as fs } from "node:fs";

const AVATAR_ROOT = path.resolve("var", "avatars");
const AVATAR_PUBLIC_PREFIX = "/avatars/";

export type AvatarSaveInput = {
  userId: string;
  version: number;
  buffer: Buffer;
  ext: string;
};

export type AvatarStorage = {
  save(input: AvatarSaveInput): Promise<{ publicUrl: string }>;
  deleteByPublicUrl(publicUrl: string | null | undefined): Promise<void>;
};

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function ensureUnderRoot(fullPath: string): void {
  const resolved = path.resolve(fullPath);
  const root = path.resolve(AVATAR_ROOT);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Invalid avatar path");
  }
}

export const avatarStorageFs: AvatarStorage = {
  async save({ userId, version, buffer, ext }) {
    const safeExt = ext.startsWith(".") ? ext.slice(1) : ext;
    const relative = path.join(userId, `${version}.${safeExt}`);
    const fullPath = path.join(AVATAR_ROOT, relative);
    ensureUnderRoot(fullPath);
    await ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, buffer);
    return { publicUrl: `${AVATAR_PUBLIC_PREFIX}${relative.replace(/\\/g, "/")}` };
  },

  async deleteByPublicUrl(publicUrl) {
    if (!publicUrl || !publicUrl.startsWith(AVATAR_PUBLIC_PREFIX)) return;
    const relative = publicUrl.slice(AVATAR_PUBLIC_PREFIX.length);
    const fullPath = path.join(AVATAR_ROOT, relative);
    ensureUnderRoot(fullPath);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      const { code } = err as { code?: string };
      if (code === "ENOENT") return;
      throw err;
    }
  },
};

