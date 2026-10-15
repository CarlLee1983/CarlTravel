import { constants } from "node:fs";
import { copyFile, lstat, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadSpots } from "../src/content/load.ts";
import { illustrationFilename } from "../src/content/illustration.ts";

async function main() {
  const [command, id, ...extra] = process.argv.slice(2);
  if (
    !id ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ||
    extra.length ||
    !["copy", "diff"].includes(command ?? "")
  )
    throw new Error("Usage: pnpm draft:copy <id> | pnpm draft:diff <id>");
  const formal = await loadSpots("content/spots");
  if (!formal.some((spot) => spot.id === id))
    throw new Error(`${id}: 找不到正式景點`);
  const original = join("content/spots", id, "spot.yaml");
  const directory = join("drafts/spots", id);
  const draft = join(directory, "spot.yaml");
  for (const root of ["drafts", "drafts/spots"]) {
    if (command === "copy") await mkdir(root, { recursive: true });
    if (!(await lstat(root)).isDirectory())
      throw new Error(`${root}: 草稿目錄不得是符號連結`);
  }
  if (command === "copy") {
    try {
      await mkdir(directory);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST")
        throw new Error(`${directory}: 草稿已存在，不覆寫`);
      throw error;
    }
    try {
      await copyFile(original, draft, constants.COPYFILE_EXCL);
      if (formal.find((spot) => spot.id === id)!.illustration)
        await copyFile(
          join("content/spots", id, illustrationFilename),
          join(directory, illustrationFilename),
          constants.COPYFILE_EXCL,
        );
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
    console.log(`已建立 ${draft}；正式內容未修改。`);
  } else {
    const drafts = await loadSpots("drafts/spots");
    if (!drafts.some((spot) => spot.id === id))
      throw new Error(`${draft}: 找不到草稿`);
    const result = spawnSync(
      "git",
      [
        "diff",
        "--no-index",
        "--no-ext-diff",
        "--no-textconv",
        "--",
        original,
        draft,
      ],
      { stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1)
      throw new Error("無法取得景點差異");
    if (result.status === 0) console.log("草稿與正式內容相同。 ");
    const before =
      formal.find((spot) => spot.id === id)!.illustration?.sha256 ?? "無";
    const after =
      drafts.find((spot) => spot.id === id)!.illustration?.sha256 ?? "無";
    if (before !== after) console.log(`插畫 SHA256：${before} → ${after}`);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
