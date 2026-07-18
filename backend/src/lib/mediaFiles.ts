import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

export async function saveMediaFile(key: string, bytes: ArrayBuffer) {
  const target = path.resolve(config.LOCAL_MEDIA_DIR, key);
  await mkdir(path.dirname(target), { recursive: true });
  await Bun.write(target, bytes);
}

export async function deleteMediaFile(key: string) {
  await unlink(path.resolve(config.LOCAL_MEDIA_DIR, key)).catch(() => undefined);
}

export async function readMediaFile(key: string) {
  const file = Bun.file(path.resolve(config.LOCAL_MEDIA_DIR, key));
  return (await file.exists()) ? file : null;
}
