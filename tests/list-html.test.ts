import test from "node:test";
import assert from "node:assert/strict";
import {
  cardItemHtml,
  pageNumbers,
  paginatorHtml,
  rangeText,
} from "../src/content/list-html.ts";
import { listHref, staticPath } from "../src/content/list-url.ts";
import type { CardView } from "../src/content/list-card.ts";

const card: CardView = {
  id: "x",
  href: "/spots/x/",
  name: "名稱 <b>&",
  meta: "臺北市 中正區 · 公園 · 戶外",
  status: null,
  summary: "摘要",
  thumbnail: null,
  tags: [
    { text: "推車友善：有", negative: false },
    { text: "哺乳室：沒有", negative: true },
  ],
  note: "備註",
};

test("範圍文字：千分位、單筆、無結果", () => {
  assert.equal(
    rangeText({ from: 25, to: 48, total: 6000 }),
    "第 25–48 筆，共 6,000 筆",
  );
  assert.equal(rangeText({ from: 1, to: 1, total: 1 }), "第 1 筆，共 1 筆");
  assert.equal(
    rangeText({ from: 5977, to: 6000, total: 6000 }),
    "第 5,977–6,000 筆，共 6,000 筆",
  );
  assert.equal(rangeText({ from: 0, to: 0, total: 0 }), "沒有符合條件的景點");
});

test("桌面頁碼：首末頁、前後各 2 頁，只缺一頁時補上、更多才用省略", () => {
  assert.deepEqual(pageNumbers(1, 1), [1]);
  assert.deepEqual(pageNumbers(1, 3), [1, 2, 3]);
  assert.deepEqual(pageNumbers(1, 10), [1, 2, 3, "gap", 10]);
  assert.deepEqual(pageNumbers(5, 10), [1, 2, 3, 4, 5, 6, 7, "gap", 10]);
  assert.deepEqual(pageNumbers(4, 10), [1, 2, 3, 4, 5, 6, "gap", 10]);
  assert.deepEqual(pageNumbers(10, 10), [1, "gap", 8, 9, 10]);
  assert.deepEqual(pageNumbers(7, 250).slice(0, 3), [1, "gap", 5]);
  assert.deepEqual(pageNumbers(6, 250).slice(0, 3), [1, "gap", 4]);
});

test("分頁器：每個連結都有 href，目前頁帶 aria-current，首末頁沒有的上下頁是隱藏空位", () => {
  const html = paginatorHtml(1, 3, (page) => staticPath(page));
  assert.match(
    html,
    /<span class="page-step page-hole" aria-hidden="true">上一頁<\/span>/,
  );
  assert.match(html, /rel="next" href="\/page\/2\/">下一頁/);
  assert.match(html, /href="\/" aria-label="第 1 頁" aria-current="page">1</);
  assert.match(html, /href="\/page\/3\/" aria-label="第 3 頁">3</);
  assert.match(html, /<span class="page-status">1 \/ 3<\/span>/);
  const last = paginatorHtml(3, 3, (page) => staticPath(page));
  assert.match(last, /rel="prev" href="\/page\/2\/">上一頁/);
  assert.match(
    last,
    /<span class="page-step page-hole" aria-hidden="true">下一頁<\/span>/,
  );
});

test("卡片字串會跳脫文字，標籤與備註照 cardView 輸出", () => {
  const html = cardItemHtml(card);
  assert.match(
    html,
    /<h3><a href="\/spots\/x\/">名稱 &lt;b&gt;&amp;<\/a><\/h3>/,
  );
  assert.match(html, /<li data-negative>哺乳室：沒有<\/li>/);
  assert.match(html, /<li>推車友善：有<\/li>/);
  assert.match(html, /<p class="card-note">備註<\/p>/);
  assert.doesNotMatch(html, /<img/);
  assert.match(
    cardItemHtml(
      {
        ...card,
        thumbnail: { src: "/a.webp?v=1", alt: "圖", width: 336, height: 224 },
      },
      "新草稿",
    ),
    /<img src="\/a\.webp\?v=1" alt="圖" width="336" height="224" loading="lazy"[^>]*>[\s\S]*新草稿 · 尚未發布|新草稿 · 尚未發布[\s\S]*<img/,
  );
});

test("網址約定：沒有條件走靜態路徑，有條件走 /?…，第 1 頁不帶 page", () => {
  const none = { query: "", county: "", kind: "", setting: "", age: "" };
  assert.equal(listHref({ ...none, page: 1 }), "/");
  assert.equal(listHref({ ...none, page: 2 }), "/page/2/");
  assert.equal(
    listHref({ ...none, county: "新北市", page: 1 }),
    "/?county=%E6%96%B0%E5%8C%97%E5%B8%82",
  );
  assert.equal(
    listHref({ ...none, query: "a b", age: "3–6 歲", page: 3 }),
    "/?query=a+b&age=3%E2%80%936+%E6%AD%B2&page=3",
  );
});
