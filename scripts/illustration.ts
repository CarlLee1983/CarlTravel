import { readFile, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { spotSchema } from "../src/content/schema.ts";
import {
  normalizeIllustration,
  illustrationFilename,
} from "../src/content/illustration.ts";
import { directory, readLocal, validId, writeLocal } from "./research/files.ts";

async function main() {
  const [id, input, alt, ...extra] = process.argv.slice(2);
  if (!id || !input || !alt || extra.length)
    throw new Error("Usage: pnpm draft:illustrate <id> <image.png> <alt>");
  validId(id);
  for (const path of ["drafts", "drafts/spots", join("drafts/spots", id)])
    await directory(path);
  const stat = await lstat(input);
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024)
    throw new Error("輸入必須是 8 MiB 內的一般 PNG 檔案");
  const bytes = normalizeIllustration(await readFile(input), true);
  const path = join("drafts/spots", id, "spot.yaml");
  const data = spotSchema.parse({
    ...parse((await readLocal(path))!),
    illustration: {
      kind: "ai-generated",
      alt,
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  });
  await writeLocal(join("drafts/spots", id, illustrationFilename), bytes);
  await writeLocal(path, stringify(data));
  console.log(`已更新 ${id} 草稿插畫並移除非像素中繼資料；請重新預覽與審閱。`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
