// 固定種子的虛構景點產生器：同一組 (seed, count) 永遠產生逐位元組相同的內容。
// 只寫到暫存目錄，不進 Git、也不碰 content/。用法見 docs/development.md。
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { stringify } from "yaml";
import districtData from "../../src/data/districts.json" with { type: "json" };
import type { z } from "zod";
import type { spotSchema } from "../../src/content/schema.ts";

// 寫進 spot.yaml 的形狀（schema 輸入型別，未套預設值）
type SpotInput = z.input<typeof spotSchema>;

export const FIXTURE_SEED = 20261017;
export const FIXTURE_COUNT = 60;
const FULL_EVERY = 20; // 每第 20 筆為完整形態，附插畫
const KNOWN_AGE_EVERY = 7; // 每第 7 筆為已知年齡、無插畫
const PLACEHOLDER_SHA256 = "0".repeat(64);

const districts: Record<string, string[]> = districtData;

export interface GenerateOptions {
  seed: number;
  count: number;
}
export interface GeneratedSpot {
  id: string;
  spot: SpotInput;
  illustrated: boolean;
}

// mulberry32：小型、可重現的亂數
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

// 縣市權重：約略依觀光景點數量分布（假設值，非官方統計）
const countyWeights: [SpotInput["county"], number][] = [
  ["基隆市", 2],
  ["臺北市", 8],
  ["新北市", 12],
  ["桃園市", 6],
  ["新竹市", 2],
  ["新竹縣", 4],
  ["苗栗縣", 5],
  ["臺中市", 8],
  ["彰化縣", 5],
  ["南投縣", 7],
  ["雲林縣", 4],
  ["嘉義市", 1.5],
  ["嘉義縣", 4],
  ["臺南市", 8],
  ["高雄市", 8],
  ["屏東縣", 6],
  ["宜蘭縣", 6],
  ["花蓮縣", 5],
  ["臺東縣", 4],
  ["澎湖縣", 2],
  ["金門縣", 1.5],
  ["連江縣", 1],
];
const kindWeights: [SpotInput["kind"], number][] = [
  ["公園", 22],
  ["博物館", 10],
  ["農場", 8],
  ["步道", 18],
  ["老街", 6],
  ["觀光工廠", 5],
  ["動物園／水族館", 2],
  ["其他", 29],
];
// 前四筆固定為兩個縣市各兩個行政區，確保任何筆數 >= 4 都涵蓋兩層縣市與行政區
const forcedPlaces: [SpotInput["county"], number][] = [
  ["臺中市", 0],
  ["臺中市", 1],
  ["高雄市", 0],
  ["高雄市", 1],
];

const syl =
  "青禾溪嵐松楓雲石湖橋泉竹梅柚桐苓沙岩霧星月川谷坡埔寮厝崙港灣原林園田".split(
    "",
  );
const nouns = [
  "步道",
  "公園",
  "親水區",
  "文化館",
  "森林園區",
  "生態池",
  "古厝",
  "老街",
  "農場",
  "觀景台",
  "廣場",
  "藝文中心",
  "故事館",
  "濕地",
  "草原",
];
const words = [
  "溜滑梯",
  "沙坑",
  "樹蔭",
  "涼亭",
  "草地",
  "木棧道",
  "展示廳",
  "導覽",
  "手作",
  "體驗",
  "雨天",
  "備案",
  "推車",
  "哺乳室",
  "停車場",
  "公車",
  "接駁",
  "步行",
  "坡道",
  "階梯",
  "觀察",
  "昆蟲",
  "鳥類",
  "季節",
  "花期",
  "落葉",
  "溪流",
  "石頭",
  "水圳",
  "稻田",
  "老屋",
  "市集",
  "小吃",
  "攤位",
  "夜景",
  "日出",
  "海風",
  "沙灘",
  "潮間帶",
  "燈塔",
  "砲台",
  "廟宇",
  "牌樓",
  "展品",
  "互動",
  "投影",
  "積木",
  "繪本",
  "溫室",
  "果園",
  "採果",
  "餵食",
  "牧草",
  "水族",
  "標本",
  "化石",
  "地質",
  "火山",
  "溫泉",
  "瀑布",
  "吊橋",
  "竹林",
  "茶園",
  "咖啡",
  "陶藝",
  "染布",
  "木工",
  "紙藝",
  "燈籠",
  "風車",
  "鐵道",
  "車站",
  "隧道",
  "自行車",
  "租借",
  "飲水機",
  "廁所",
  "親子廁所",
  "無障礙",
  "電梯",
  "售票",
  "免費",
  "預約",
  "休館",
  "週一",
  "假日",
  "清晨",
  "傍晚",
];

export function describeSpots(
  { seed, count }: GenerateOptions,
  illustrationSha256 = PLACEHOLDER_SHA256,
): GeneratedSpot[] {
  const rand = makeRng(seed);
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(rand() * items.length)]!;
  const weighted = <T>(pairs: readonly (readonly [T, number])[]): T => {
    const sum = pairs.reduce((total, [, weight]) => total + weight, 0);
    let r = rand() * sum;
    for (const [value, weight] of pairs) if ((r -= weight) < 0) return value;
    return pairs.at(-1)![0];
  };
  const phrase = (n: number) =>
    Array.from({ length: n }, () => pick(words)).join("、");
  const sentence = (n: number) => `${phrase(n)}可作為安排參考（虛構）。`;
  // 摘要最多 30 字
  const summary = () =>
    [
      `${pick(words)}與${pick(words)}，${pick(words)}`,
      pick(["適合散步", "可短暫停留", "適合半日", "雨天可去", "適合觀察"]),
    ]
      .join("")
      .slice(0, 30);
  const day = () =>
    `2026-${String(1 + Math.floor(rand() * 9)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`;

  const result: GeneratedSpot[] = [];
  for (let i = 1; i <= count; i++) {
    const id = `fx-${String(i).padStart(5, "0")}`;
    const forced = forcedPlaces[i - 1];
    const county = forced?.[0] ?? weighted(countyWeights);
    const randomDistrict = pick(districts[county]!);
    const district = forced ? districts[county]![forced[1]]! : randomDistrict;
    const kind = weighted(kindWeights);
    const setting: SpotInput["setting"] =
      (
        {
          博物館: "室內",
          觀光工廠: "室內",
          步道: "戶外",
          公園: "戶外",
          老街: "戶外",
        } as Record<string, SpotInput["setting"]>
      )[kind] ??
      weighted<SpotInput["setting"]>([
        ["戶外", 5],
        ["室內", 2],
        ["室內外皆有", 3],
      ]);
    const full = i % FULL_EVERY === 0;
    const knownAge = full || i % KNOWN_AGE_EVERY === 0;
    const base = {
      name: `${pick(syl)}${pick(syl)}${pick(nouns)}${i}號（虛構）`,
      address: `${county}${district}虛構路${1 + Math.floor(rand() * 300)}號（虛構）`,
      county,
      district,
      kind,
      setting,
      summary: summary(),
    };
    const openDataFacts = {
      id: "facts-data",
      kind: "openData" as const,
      purpose: "facts" as const,
      title: "虛構觀光資料集",
      url: `https://example.org/data/${id}`,
      organization: "虛構資料提供機關",
      attribution: {
        provider: "虛構資料提供機關",
        year: 2026,
        dataset: "虛構景點資料集",
        version: "1",
      },
    };
    const positioning = {
      id: "positioning",
      kind: "openData" as const,
      purpose: "positioning" as const,
      title: "虛構景點定位資料",
      url: `https://example.org/position/${id}`,
      organization: "虛構資料提供機關",
      attribution: {
        provider: "虛構資料提供機關",
        year: 2026,
        dataset: "虛構定位資料集",
        version: "1",
      },
    };
    const location = {
      lat: +(22 + rand() * 3.2).toFixed(5),
      lng: +(120 + rand() * 1.9).toFixed(5),
    };
    let spot: SpotInput;
    if (!full) {
      // 公開資料頁形態：最小合法欄位；親子條件全未知。每第 7 筆另標示年齡
      const min = Math.floor(rand() * 4);
      spot = {
        ...base,
        ageRange: knownAge
          ? { status: "known", min, max: min + 6, ref: "facts-data" }
          : { status: "unknown" },
        tourismId: { value: `FX-${i}`, ref: "positioning" },
        officialRefs: [openDataFacts, positioning],
        sources: [],
        location,
        transport: {
          checkedAt: day(),
          facts: [
            {
              status: "ok",
              label: "交通",
              value: sentence(4),
              ref: "facts-data",
            },
          ],
        },
        hoursAndFees: {
          checkedAt: day(),
          facts: [
            {
              status: "ok",
              label: "開放時間",
              value: sentence(3),
              ref: "facts-data",
            },
          ],
        },
        familyChecklist: { checkedAt: day() },
      };
    } else {
      const min = Math.floor(rand() * 4);
      spot = {
        ...base,
        illustration: {
          kind: "ai-generated",
          alt: `虛構情境插畫，${phrase(3)}（虛構）`,
          sha256: illustrationSha256,
          width: 1536,
          height: 1024,
        },
        ageRange: {
          status: "known",
          min,
          max: min + 6 + Math.floor(rand() * 6),
          ref: "office",
        },
        tourismId: { value: `FX-${i}`, ref: "positioning" },
        officialRefs: [
          {
            id: "office",
            kind: "page",
            title: "虛構管理處公告",
            url: `https://example.org/office/${id}`,
            organization: "虛構管理處",
          },
          {
            id: "agency",
            kind: "page",
            title: "虛構主管機關公告",
            url: `https://example.org/agency/${id}`,
            organization: "虛構主管機關",
          },
          positioning,
        ],
        sources: [
          {
            id: "reader",
            title: "虛構家庭遊記",
            url: `https://example.org/story/${id}`,
            author: "虛構作者",
            readAt: day(),
            readable: true,
          },
        ],
        authorNotes: [
          {
            source: "reader",
            summary: sentence(5),
            quotes: [`${phrase(3)}都很好玩（虛構）。`],
          },
        ],
        facilities: {
          checkedAt: day(),
          facts: [
            {
              status: "ok",
              label: "飲水設施",
              value: sentence(3),
              ref: "office",
            },
            { status: "ok", label: "廁所", value: sentence(3), ref: "office" },
          ],
        },
        withKids: {
          checkedAt: day(),
          facts: [
            { text: sentence(5), ref: "office" },
            { text: sentence(4), ref: "office" },
          ],
          activities: [sentence(3), sentence(3)],
        },
        agentTips: [sentence(5), sentence(4)],
        nearby: [
          {
            name: `${pick(syl)}${pick(syl)}食堂（虛構）`,
            kind: "food",
            note: sentence(3),
            source: "reader",
          },
          {
            name: `${pick(syl)}${pick(syl)}民宿（虛構）`,
            kind: "stay",
            note: sentence(3),
          },
        ],
        location,
        transport: {
          checkedAt: day(),
          facts: [
            {
              status: "ok",
              label: "大眾運輸",
              value: sentence(5),
              ref: "office",
            },
            { status: "unpublished", label: "停車費用" },
          ],
        },
        hoursAndFees: {
          checkedAt: day(),
          facts: [
            {
              status: "ok",
              label: "開放時間",
              value: sentence(4),
              ref: "office",
            },
            {
              status: "conflict",
              label: "門票",
              claims: [
                { value: "全票一百元（虛構）。", ref: "office" },
                { value: "全票一百二十元（虛構）。", ref: "agency" },
              ],
              contact: "票價說法不一致，出發前請洽管理處（虛構）。",
            },
          ],
        },
        familyChecklist: {
          checkedAt: day(),
          stroller: { status: "yes", ref: "office", note: sentence(2) },
          nursingRoom: { status: "no", ref: "office" },
          familyToilet: { status: "unknown" },
          rainyDay: { status: "yes", ref: "office" },
          accessibility: { status: "unknown" },
          notes: sentence(3),
        },
      };
    }
    result.push({ id, spot, illustrated: full });
  }
  return result;
}

// 插畫：1536×1024 RGB PNG，低頻色塊加雜訊，大小接近正式插畫（約 3 MB）。
// 以固定種子產生，所有完整形態景點共用同一張。
async function makeIllustration(seed: number) {
  const rand = makeRng(seed ^ 0x9e3779b9);
  const w = 1536,
    h = 1024,
    raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const base = [
        180 + 40 * Math.sin(x / 140) * Math.cos(y / 90),
        160 + 50 * Math.sin((x + y) / 210),
        130 + 45 * Math.cos(x / 75 - y / 160),
      ];
      for (let c = 0; c < 3; c++)
        raw[o + c] = Math.max(
          0,
          Math.min(255, Math.round(base[c]! + (rand() - 0.5) * 38)),
        );
    }
  const out = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  // sharp 會寫入 pHYs；插畫規則只接受 IHDR／IDAT／IEND，所以移除其他區塊
  const parts = [out.subarray(0, 8)];
  for (let o = 8; o < out.length;) {
    const end = o + 12 + out.readUInt32BE(o);
    if (["IHDR", "IDAT", "IEND"].includes(out.toString("ascii", o + 4, o + 8)))
      parts.push(out.subarray(o, end));
    o = end;
  }
  return Buffer.concat(parts);
}

export async function writeSpots(dir: string, options: GenerateOptions) {
  const needsImage = options.count >= FULL_EVERY;
  const png = needsImage ? await makeIllustration(options.seed) : undefined;
  const sha256 = png && createHash("sha256").update(png).digest("hex");
  const spots = describeSpots(options, sha256);
  await mkdir(dir, { recursive: true });
  for (const { id, spot, illustrated } of spots) {
    await mkdir(join(dir, id));
    await writeFile(join(dir, id, "spot.yaml"), stringify(spot));
    if (illustrated) await writeFile(join(dir, id, "illustration.png"), png!);
  }
  return spots.length;
}

function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith("--") || argv[i + 1] === undefined)
      throw new Error(`無法解析參數：${argv[i] ?? ""}`);
    values.set(key.slice(2), argv[i + 1]!);
  }
  const seed = Number(values.get("seed") ?? FIXTURE_SEED);
  const count = Number(values.get("count") ?? FIXTURE_COUNT);
  if (!Number.isInteger(seed) || !Number.isInteger(count) || count < 1)
    throw new Error("--seed 與 --count 必須是整數，且 count >= 1");
  return { seed, count, out: values.get("out") };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { seed, count, out } = parseArgs(process.argv.slice(2));
  const target = out
    ? resolve(out)
    : await mkdtemp(join(tmpdir(), "carltravel-spots-"));
  const inRepo = relative(process.cwd(), target);
  if (inRepo !== "" && !inRepo.startsWith("..") && !isAbsolute(inRepo))
    throw new Error(`輸出目錄不得在專案內：${target}`);
  await writeSpots(target, { seed, count });
  // stdout 只印目錄，方便腳本取用
  console.log(target);
}
