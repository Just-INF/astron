import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const assets = path.resolve("dist/assets");
const files = await readdir(assets);
const sizes = new Map<string, number>();
for (const file of files) sizes.set(file, (await stat(path.join(assets, file))).size);

const failures: string[] = [];
for (const [file, size] of sizes) {
  const limit = file.startsWith("three-")
    ? 950_000
    : file.endsWith(".js")
      ? 450_000
      : file.endsWith(".mp4")
        ? 4_000_000
        : Infinity;
  if (size > limit) failures.push(`${file}: ${size} bytes exceeds ${limit}`);
}
const entry = [...sizes].find(([file]) => file.startsWith("index-") && file.endsWith(".js"));
if (!entry || entry[1] > 150_000)
  failures.push(
    `initial application chunk must remain at or below 150000 bytes (found ${entry?.[1] ?? "missing"})`,
  );
if (failures.length) throw new Error(`Bundle budget failed:\n${failures.join("\n")}`);
console.info(
  JSON.stringify({ event: "bundle_budget_passed", initialBytes: entry[1], assetCount: sizes.size }),
);
