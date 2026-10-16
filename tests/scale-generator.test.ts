import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSpots } from "../src/content/load.ts";
import {
  FIXTURE_COUNT,
  FIXTURE_SEED,
  describeSpots,
  writeSpots,
} from "../scripts/scale/generate-spots.ts";

async function snapshot(dir: string) {
  const files = new Map<string, Buffer>();
  for (const id of (await readdir(dir)).sort())
    for (const file of (await readdir(join(dir, id))).sort())
      files.set(`${id}/${file}`, await readFile(join(dir, id, file)));
  return files;
}

test("same seed and count produce byte-identical, schema-valid output", async () => {
  const a = await mkdtemp(join(tmpdir(), "carltravel-gen-a-"));
  const b = await mkdtemp(join(tmpdir(), "carltravel-gen-b-"));
  try {
    await writeSpots(a, { seed: FIXTURE_SEED, count: FIXTURE_COUNT });
    await writeSpots(b, { seed: FIXTURE_SEED, count: FIXTURE_COUNT });
    const first = await snapshot(a);
    const second = await snapshot(b);
    assert.deepEqual([...first.keys()], [...second.keys()]);
    for (const [name, bytes] of first)
      assert.ok(bytes.equals(second.get(name)!), name);
    const spots = await loadSpots(a);
    assert.equal(spots.length, FIXTURE_COUNT);
  } finally {
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  }
});

test("different seeds produce different content", () => {
  const a = describeSpots({ seed: 1, count: 10 }).map((s) => s.spot.name);
  const b = describeSpots({ seed: 2, count: 10 }).map((s) => s.spot.name);
  assert.notDeepEqual(a, b);
});

test("the fixture set covers the required shapes", () => {
  const spots = describeSpots({ seed: FIXTURE_SEED, count: FIXTURE_COUNT });
  const districtsByCounty = new Map<string, Set<string>>();
  for (const { spot } of spots) {
    const set = districtsByCounty.get(spot.county) ?? new Set<string>();
    districtsByCounty.set(spot.county, set.add(spot.district));
  }
  const multi = [...districtsByCounty.values()].filter((d) => d.size >= 2);
  assert.ok(districtsByCounty.size >= 2 && multi.length >= 2);
  assert.ok(spots.some(({ spot }) => spot.ageRange.status === "known"));
  assert.ok(spots.some(({ spot }) => spot.ageRange.status === "unknown"));
  assert.ok(spots.some(({ spot }) => spot.illustration));
  assert.ok(spots.some(({ spot }) => !spot.illustration));
  assert.ok(
    spots.some(
      ({ spot }) => Object.keys(spot.familyChecklist).join() === "checkedAt",
    ),
  );
  assert.equal(new Set(spots.map(({ id }) => id)).size, FIXTURE_COUNT);
});
