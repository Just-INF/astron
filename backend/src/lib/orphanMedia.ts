import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

async function walk(
  directory: string,
  root = directory,
): Promise<Array<{ key: string; modifiedAt: Date }>> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: Array<{ key: string; modifiedAt: Date }> = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute, root)));
    else if (entry.isFile() && entry.name !== ".gitkeep")
      files.push({
        key: path.relative(root, absolute).split(path.sep).join("/"),
        modifiedAt: (await stat(absolute)).mtime,
      });
  }
  return files;
}

export function orphanMediaKeys(
  files: Array<{ key: string; modifiedAt: Date }>,
  referencedKeys: Iterable<string>,
  olderThan: Date,
) {
  const referenced = new Set(referencedKeys);
  return files
    .filter((file) => !referenced.has(file.key) && file.modifiedAt < olderThan)
    .map((file) => file.key);
}

export async function removeOrphanMedia(
  directory: string,
  referencedKeys: Iterable<string>,
  olderThan: Date,
  dryRun = false,
) {
  const keys = orphanMediaKeys(await walk(directory), referencedKeys, olderThan);
  if (!dryRun)
    for (const key of keys) await unlink(path.resolve(directory, key)).catch(() => undefined);
  return keys;
}
