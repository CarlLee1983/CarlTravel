import { readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { spotSchema, counties, type Spot } from "./schema.ts";
import { illustrationFilename, readIllustration } from "./illustration.ts";

export async function loadSpots(root: string): Promise<Spot[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const spots: Spot[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name))
      throw new Error(`${root}/${entry.name}: 景點必須是有效 id 的資料夾`);
    const file = join(root, entry.name, "spot.yaml");
    try {
      if (!(await lstat(file)).isFile())
        throw new Error("spot.yaml 必須是一般檔案");
      const result = spotSchema.safeParse(parse(await readFile(file, "utf8")));
      if (!result.success)
        throw new Error(
          result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("\n"),
        );
      for (const asset of await readdir(join(root, entry.name))) {
        if (
          asset !== "spot.yaml" &&
          !(asset === illustrationFilename && result.data.illustration)
        )
          throw new Error(`${asset}: 景點不允許未宣告的圖片或其他附件`);
      }
      if (result.data.illustration)
        await readIllustration(
          join(root, entry.name),
          result.data.illustration,
        );
      spots.push({ ...result.data, id: entry.name });
    } catch (error) {
      throw new Error(
        `${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return spots.sort(compareSpots);
}

export function compareSpots(a: Spot, b: Spot) {
  return (
    counties.indexOf(a.county) - counties.indexOf(b.county) ||
    a.name.localeCompare(b.name, "zh-Hant")
  );
}
