import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpots } from "../src/content/load.ts";
import { checkIsolation } from "./publish/isolation.ts";

// Deployment alone requires real content; development and PR verification allow zero.
export async function checkDeployment(root = process.cwd()) {
  const formal = await loadSpots(join(root, "content/spots"));
  if (formal.length === 0) throw new Error("正式部署至少一個已核准景點");
  const fixtures = await loadSpots(join(root, "tests/fixtures/spots"));
  for (const spot of formal) {
    if (
      fixtures.some(
        (fixture) => fixture.id === spot.id || fixture.name === spot.name,
      ) ||
      /虛構|https?:\/\/(?:www\.)?example\.(?:org|com|net)(?:[/:"\s]|$)/i.test(
        JSON.stringify(spot),
      )
    )
      throw new Error("測試或虛構景點不能滿足正式部署門檻");
  }
  await checkIsolation(root);
  return formal.length;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      `Deployment artifact verified: ${await checkDeployment()} formal spot(s).`,
    );
  } catch {
    // Content validators can include private text in their errors; never print it in CI.
    console.error(
      "部署阻擋：須有至少一個已核准的非測試景點，且正式產物與索引必須通過隔離檢查。",
    );
    process.exitCode = 1;
  }
}
