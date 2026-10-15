import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { loadSpots } from "../src/content/load.ts";
import { ageLabel } from "../src/content/schema.ts";

const fixture = parse(
  await readFile("tests/fixtures/spots/example-park/spot.yaml", "utf8"),
);
async function withContent(
  data: unknown,
  run: (root: string) => Promise<void>,
  id = "example-park",
) {
  const root = await mkdtemp(join(tmpdir(), "carltravel-content-"));
  try {
    await mkdir(join(root, id));
    await writeFile(join(root, id, "spot.yaml"), stringify(data));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("single YAML yields stable folder id and visible official information", async () => {
  const [spot] = await loadSpots("tests/fixtures/spots");
  assert.equal(spot!.id, "example-park");
  assert.equal(spot!.name, "範例親子公園");
  assert.equal(ageLabel(spot!.ageRange), "年齡未標示");
  assert.equal(spot!.transport.checkedAt, "2026-10-15");
  assert.equal(spot!.familyChecklist.stroller.status, "unknown");
});
for (const [name, change, error] of [
  ["missing name", (v: any) => delete v.name, /name/],
  ["invalid district", (v: any) => (v.district = "不存在區"), /district/],
  ["district in wrong county", (v: any) => (v.district = "板橋區"), /district/],
  ["unsupported category", (v: any) => (v.kind = "餐廳"), /kind/],
  ["oversized summary", (v: any) => (v.summary = "字".repeat(31)), /summary/],
  [
    "invalid date",
    (v: any) => (v.transport.checkedAt = "2026-02-30"),
    /checkedAt/,
  ],
  [
    "missing reference",
    (v: any) => (v.transport.facts[0].ref = "missing"),
    /ref/,
  ],
  [
    "unsafe URL",
    (v: any) => (v.officialRefs[0].url = "javascript:alert(1)"),
    /url/,
  ],
  [
    "unused reference",
    (v: any) => v.officialRefs.push({ ...v.officialRefs[0], id: "unused" }),
    /未使用/,
  ],
  [
    "duplicate reference",
    (v: any) => v.officialRefs.push({ ...v.officialRefs[0] }),
    /重複/,
  ],
  [
    "invalid age",
    (v: any) =>
      (v.ageRange = { status: "known", min: 6, max: 2, ref: "example-office" }),
    /ageRange/,
  ],
  [
    "unexpected private field",
    (v: any) => (v.privateNotes = "private"),
    /privateNotes/,
  ],
] as const)
  test(`load rejects ${name} with file and field evidence`, async () => {
    const data = structuredClone(fixture);
    change(data);
    await withContent(data, async (root) => {
      await assert.rejects(loadSpots(root), (err) => {
        assert.match(String(err), /example-park\/spot.yaml/);
        assert.match(String(err), error);
        return true;
      });
    });
  });
test("invalid folder id rejected at load boundary", async () => {
  await withContent(
    fixture,
    async (root) => {
      await assert.rejects(loadSpots(root), /有效 id/);
    },
    "Invalid-ID",
  );
});
test("zero formal spots supported; missing root is an error", async () => {
  const root = await mkdtemp(join(tmpdir(), "carltravel-empty-"));
  try {
    assert.deepEqual(await loadSpots(root), []);
    await assert.rejects(loadSpots(join(root, "missing")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("official age range requires citation and preserves open upper bound", async () => {
  const data = structuredClone(fixture);
  data.ageRange = { status: "known", min: 3, ref: "example-office" };
  await withContent(data, async (root) =>
    assert.equal(ageLabel((await loadSpots(root))[0]!.ageRange), "3 歲以上"),
  );
});
