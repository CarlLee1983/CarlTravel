import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { loadSpots } from "../src/content/load.ts";

const basic = parse(
  await readFile("tests/fixtures/spots/example-park/spot.yaml", "utf8"),
);
const readable = {
  id: "2026-10-15-example",
  title: "範例遊記",
  url: "https://example.org/story",
  author: "範例作者",
  readAt: "2026-10-15",
  readable: true,
};
async function withSpot(data: unknown, check: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "carltravel-complete-"));
  try {
    await mkdir(join(root, "example-park"));
    await writeFile(join(root, "example-park", "spot.yaml"), stringify(data));
    await check(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("readable source supports attributed summary and quotes while unreadable source remains provenance only", async () => {
  await withSpot(
    {
      ...basic,
      sources: [readable, { ...readable, id: "unreadable", readable: false }],
      authorNotes: [
        {
          source: readable.id,
          summary: "樹蔭下的休息空間適合放慢腳步。",
          quotes: ["我們在樹下休息。"],
        },
      ],
    },
    async (root) => {
      const [spot] = await loadSpots(root);
      assert.equal(spot!.authorNotes[0]!.source, readable.id);
      assert.equal(spot!.sources[1]!.readable, false);
    },
  );
});
test("quote limits apply across all notes of one source and count Unicode characters", async () => {
  const note = {
    source: readable.id,
    summary: "步道沿線有樹蔭。",
    quotes: ["我".repeat(60)],
  };
  await withSpot(
    { ...basic, sources: [readable], authorNotes: [note] },
    async (root) => {
      await loadSpots(root);
    },
  );
  await withSpot(
    {
      ...basic,
      sources: [readable],
      authorNotes: [{ ...note, quotes: ["字".repeat(61)] }],
    },
    async (root) => {
      await assert.rejects(loadSpots(root), /quotes.*60/);
    },
  );
  await withSpot(
    {
      ...basic,
      sources: [readable],
      authorNotes: [
        { ...note, quotes: ["甲", "乙"] },
        { ...note, quotes: ["丙"] },
      ],
    },
    async (root) => {
      await assert.rejects(loadSpots(root), /每來源最多兩段/);
    },
  );
});
test("optional sections share validated official and source references", async () => {
  const additions = {
    facilities: {
      checkedAt: "2026-10-15",
      facts: [
        {
          status: "ok",
          label: "設施",
          value: "有飲水台。",
          ref: "example-office",
        },
      ],
    },
    withKids: {
      checkedAt: "2026-10-15",
      facts: [{ text: "步道旁有落葉植物。", ref: "example-office" }],
      activities: ["觀察葉片形狀。"],
    },
    agentTips: ["安排短程散步。"],
    nearby: [
      {
        name: "範例食堂",
        kind: "food",
        note: "可安排用餐。",
        source: readable.id,
      },
    ],
    location: { lat: 25.03, lng: 121.52 },
  };
  await withSpot(
    { ...basic, ...additions, sources: [readable] },
    async (root) => {
      const [spot] = await loadSpots(root);
      assert.equal(spot!.withKids!.activities[0], "觀察葉片形狀。");
      assert.equal(spot!.nearby[0]!.source, readable.id);
    },
  );
  await withSpot(
    {
      ...basic,
      ...additions,
      sources: [readable],
      withKids: {
        ...additions.withKids,
        facts: [{ text: "樹木", ref: "missing" }],
      },
    },
    async (root) => {
      await assert.rejects(loadSpots(root), /withKids.facts.0.ref/);
    },
  );
});
test("tourism positioning explicitly uses a fully attributed open dataset", async () => {
  const openData = {
    id: "tourism",
    kind: "openData",
    purpose: "positioning",
    title: "範例定位資料",
    url: "https://example.org/data",
    organization: "範例提供機關",
    attribution: {
      provider: "範例提供機關",
      year: 2026,
      dataset: "範例景點定位資料集",
      version: "1",
    },
  };
  await withSpot(
    {
      ...basic,
      officialRefs: [...basic.officialRefs, { ...openData, purpose: "facts" }],
      hoursAndFees: {
        checkedAt: "2026-10-15",
        facts: [
          { status: "ok", label: "費用", value: "免費。", ref: "tourism" },
        ],
      },
    },
    async (root) => {
      await loadSpots(root);
    },
  );
  const data = {
    ...basic,
    tourismId: { value: "EXAMPLE-001", ref: "tourism" },
    officialRefs: [...basic.officialRefs, openData],
  };
  await withSpot(data, async (root) => {
    const [spot] = await loadSpots(root);
    assert.equal(spot!.tourismId!.ref, "tourism");
  });
  await withSpot(
    { ...data, tourismId: { value: "EXAMPLE-001", ref: "example-office" } },
    async (root) => {
      await assert.rejects(loadSpots(root), /tourismId.ref.*開放資料/);
    },
  );
  await withSpot(
    {
      ...data,
      officialRefs: [
        ...basic.officialRefs,
        {
          ...openData,
          attribution: {
            provider: "範例提供機關",
            year: 2026,
            dataset: "範例資料集",
          },
        },
      ],
    },
    async (root) => {
      await assert.rejects(loadSpots(root), /attribution.version/);
    },
  );
  await withSpot(
    { ...basic, officialRefs: [...basic.officialRefs, openData] },
    async (root) => {
      await assert.rejects(loadSpots(root), /未使用的官方出處/);
    },
  );
});
test("first-person prose is rejected outside quote strings", async () => {
  for (const data of [
    { ...basic, summary: "我們推薦這個景點。" },
    {
      ...basic,
      sources: [readable],
      authorNotes: [
        {
          source: readable.id,
          summary: "我覺得適合散步。",
          quotes: ["我們喜歡散步。"],
        },
      ],
    },
    { ...basic, agentTips: ["我們可以先休息。"] },
    {
      ...basic,
      familyChecklist: { ...basic.familyChecklist, notes: "我們可帶推車。" },
    },
  ])
    await withSpot(data, async (root) => {
      await assert.rejects(loadSpots(root), /第一人稱/);
    });
});
test("spot images are rejected as fields, embedded prose, and files", async () => {
  for (const data of [
    { ...basic, image: "photo.jpg" },
    { ...basic, summary: "![照片](photo.jpg)" },
    {
      ...basic,
      sources: [readable],
      authorNotes: [
        {
          source: readable.id,
          summary: "觀察樹木。",
          quotes: ['<img src="photo.jpg">'],
        },
      ],
    },
  ]) {
    await withSpot(data, async (root) => {
      await assert.rejects(loadSpots(root), /image|圖片/);
    });
  }
  await withSpot(basic, async (root) => {
    await writeFile(join(root, "example-park", "photo.jpg"), "fixture image");
    await assert.rejects(loadSpots(root), /photo.jpg.*圖片|圖片.*photo.jpg/);
  });
});
test("source references must exist and unreadable sources cannot support author notes", async () => {
  for (const data of [
    {
      ...basic,
      authorNotes: [{ source: "missing", summary: "展區可分段閱讀。" }],
    },
    {
      ...basic,
      sources: [{ ...readable, readable: false }],
      authorNotes: [{ source: readable.id, summary: "展區可分段閱讀。" }],
    },
    {
      ...basic,
      nearby: [
        {
          name: "範例食堂",
          kind: "food",
          note: "可安排用餐。",
          source: "missing",
        },
      ],
    },
    { ...basic, sources: [readable] },
  ])
    await withSpot(data, async (root) => {
      await assert.rejects(
        loadSpots(root),
        /來源參照不存在|不可讀來源|未使用的來源/,
      );
    });
  await withSpot(
    { ...basic, sources: [{ ...readable, readable: false }] },
    async (root) => {
      const [spot] = await loadSpots(root);
      assert.deepEqual(spot!.authorNotes, []);
    },
  );
});
test("official states reject missing evidence rather than rendering unsupported claims", async () => {
  for (const [data, field] of [
    [
      {
        ...basic,
        familyChecklist: {
          ...basic.familyChecklist,
          stroller: { status: "yes" },
        },
      },
      /familyChecklist.stroller.ref/,
    ],
    [
      {
        ...basic,
        hoursAndFees: {
          checkedAt: "2026-10-15",
          facts: [
            {
              status: "conflict",
              label: "門票",
              claims: [{ value: "免費", ref: "example-office" }],
              contact: "請洽管理處。",
            },
          ],
        },
      },
      /claims/,
    ],
    [
      {
        ...basic,
        withKids: {
          checkedAt: "2026-10-15",
          facts: [],
          activities: ["觀察葉片。"],
        },
      },
      /withKids.facts/,
    ],
    [
      {
        ...basic,
        facilities: {
          checkedAt: "2026-10-15",
          facts: [
            {
              status: "ok",
              label: "飲水台",
              value: "有飲水台。",
              ref: "missing",
            },
          ],
        },
      },
      /facilities.facts.0.ref/,
    ],
  ] as const)
    await withSpot(data, async (root) => {
      await assert.rejects(loadSpots(root), field);
    });
});
test("tourism positioning evidence cannot replace factual verification", async () => {
  const museum = parse(
    await readFile("tests/fixtures/spots/example-museum/spot.yaml", "utf8"),
  );
  museum.hoursAndFees.facts[0].ref = "tourism";
  await withSpot(museum, async (root) => {
    await assert.rejects(loadSpots(root), /hoursAndFees.facts.0.ref.*只用定位/);
  });
});
test("conflict needs distinct statements and distinct official references", async () => {
  const claims = [
    { value: "全票一百元。", ref: "example-office" },
    { value: "全票一百元。", ref: "example-office" },
  ];
  await withSpot(
    {
      ...basic,
      hoursAndFees: {
        checkedAt: "2026-10-15",
        facts: [
          {
            status: "conflict",
            label: "門票",
            claims,
            contact: "請洽管理處。",
          },
        ],
      },
    },
    async (root) => {
      await assert.rejects(loadSpots(root), /不同說法.*不同出處/);
    },
  );
});
test("positioning-only evidence stays restricted under another reference id or without a tourism id", async () => {
  const museum = parse(
    await readFile("tests/fixtures/spots/example-museum/spot.yaml", "utf8"),
  );
  const tourism = museum.officialRefs.find(
    (ref: { id: string }) => ref.id === "tourism",
  );
  museum.officialRefs.push({ ...tourism, id: "tourism-copy" });
  museum.hoursAndFees.facts[0].ref = "tourism-copy";
  await withSpot(museum, async (root) => {
    await assert.rejects(loadSpots(root), /hoursAndFees.facts.0.ref.*只用定位/);
  });
  delete museum.tourismId;
  await withSpot(museum, async (root) => {
    await assert.rejects(loadSpots(root), /hoursAndFees.facts.0.ref.*只用定位/);
  });
});
