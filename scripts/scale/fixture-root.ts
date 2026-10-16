// 組出 fixture 建置用的內容根目錄：手寫的 tests/fixtures/spots 加上固定種子的產生景點。
// 只建立在暫存目錄；呼叫端負責在結束時刪除。
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_COUNT, FIXTURE_SEED, writeSpots } from "./generate-spots.ts";

export async function assembleFixtureRoot(
  handWritten = "tests/fixtures/spots",
) {
  const root = await mkdtemp(join(tmpdir(), "carltravel-fixture-"));
  await cp(handWritten, root, { recursive: true });
  await writeSpots(root, { seed: FIXTURE_SEED, count: FIXTURE_COUNT });
  return root;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  // stdout 只印目錄，供 scripts/site.mjs 取用
  console.log(await assembleFixtureRoot());
}
