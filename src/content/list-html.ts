// 列表的 HTML 字串渲染：靜態頁（Astro 以 set:html 輸出）與瀏覽器端依列表 JSON 渲染共用，
// 所以兩邊的卡片、範圍文字與分頁器標記完全相同。純字串函式，不碰 DOM、不得引用 node 模組。
import type { CardView } from "./list-card.ts";

const escapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => escapes[char]!);

export function cardItemHtml(card: CardView, preview?: string) {
  const thumbnail = card.thumbnail
    ? `<img src="${escapeHtml(card.thumbnail.src)}" alt="${escapeHtml(card.thumbnail.alt)}" width="${card.thumbnail.width}" height="${card.thumbnail.height}" loading="lazy" decoding="async">`
    : "";
  const tags =
    card.tags.length > 0
      ? `<ul class="card-tags" aria-label="已知親子條件">${card.tags
          .map(
            (tag) =>
              `<li${tag.negative ? " data-negative" : ""}>${escapeHtml(tag.text)}</li>`,
          )
          .join("")}</ul>`
      : "";
  return (
    `<li><article class="spot-card">` +
    `<h3><a href="${escapeHtml(card.href)}">${escapeHtml(card.name)}</a></h3>` +
    `<p class="card-meta">${escapeHtml(card.meta)}</p>` +
    (card.status
      ? `<p class="card-status">${escapeHtml(card.status)}</p>`
      : "") +
    (preview
      ? `<p class="preview-label">${escapeHtml(preview)} · 尚未發布</p>`
      : "") +
    `<div class="card-body">${thumbnail}<p class="spot-summary">${escapeHtml(card.summary)}</p></div>` +
    tags +
    `<p class="card-note">${escapeHtml(card.note)}</p>` +
    `</article></li>`
  );
}

const grouped = (value: number) =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// 篩選選項的文字，例如「新北市（1,234）」；沒有筆數的「全部…」選項不走這裡
export const optionLabel = (value: string, count: number) =>
  `${value}（${grouped(count)}）`;

// 唯一的筆數播報處，例如「第 25–48 筆，共 6,000 筆」
export function rangeText(range: { from: number; to: number; total: number }) {
  if (range.total === 0) return "沒有符合條件的景點";
  const span =
    range.from === range.to
      ? grouped(range.from)
      : `${grouped(range.from)}–${grouped(range.to)}`;
  return `第 ${span} 筆，共 ${grouped(range.total)} 筆`;
}

// 桌面版頁碼：第一頁、最後一頁與目前頁前後各 2 頁；中間只缺一頁時直接補上，缺更多才用「…」
export function pageNumbers(page: number, totalPages: number) {
  const wanted = new Set(
    [1, totalPages, ...[-2, -1, 0, 1, 2].map((offset) => page + offset)].filter(
      (number) => number >= 1 && number <= totalPages,
    ),
  );
  const numbers = [...wanted].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  numbers.forEach((number, index) => {
    const previous = numbers[index - 1];
    if (previous !== undefined && number - previous === 2)
      items.push(number - 1);
    else if (previous !== undefined && number - previous > 2) items.push("gap");
    items.push(number);
  });
  return items;
}

// 分頁器 <nav> 的內容。手機顯示「上一頁、目前頁／總頁數、下一頁」，
// 桌面再顯示頁碼列（由 CSS 切換）；每個連結都是真的 href；頭尾頁沒有的上一頁／下一頁留隱藏的空位，版面不跳動。
export function paginatorHtml(
  page: number,
  totalPages: number,
  hrefFor: (page: number) => string,
) {
  const step = (target: number, rel: string, label: string) =>
    target >= 1 && target <= totalPages
      ? `<a class="page-step" rel="${rel}" href="${escapeHtml(hrefFor(target))}">${label}</a>`
      : `<span class="page-step page-hole" aria-hidden="true">${label}</span>`;
  const numbers = pageNumbers(page, totalPages)
    .map((item) =>
      item === "gap"
        ? `<li class="page-gap" aria-hidden="true">…</li>`
        : `<li><a href="${escapeHtml(hrefFor(item))}" aria-label="第 ${item} 頁"${item === page ? ' aria-current="page"' : ""}>${item}</a></li>`,
    )
    .join("");
  return (
    step(page - 1, "prev", "上一頁") +
    `<span class="page-status">${page} / ${totalPages}</span>` +
    `<ol class="page-numbers">${numbers}</ol>` +
    step(page + 1, "next", "下一頁")
  );
}

// 選了年齡帶時，範圍文字下方的說明：年齡未標示的景點沒有列入
export const ageNoteText = (count: number) =>
  `另有 ${grouped(count)} 筆年齡未標示，未列入`;

// 篩選區底部按鈕的文字，筆數與範圍文字的總筆數相同
export const resultsButtonText = (total: number) =>
  `查看 ${grouped(total)} 筆結果`;

export interface RecoveryItem {
  // 條件名稱（「搜尋」「縣市」…）與值
  label: string;
  value: string;
  // 移除這項條件後可得的筆數，連結指向移除後的網址
  count: number;
  href: string;
}

// 無結果時的移除清單項目。連結的朗讀名稱帶上被移除的條件，視覺文字則是「移除後可得 N 筆」
export function recoveryItemsHtml(items: readonly RecoveryItem[]) {
  return items
    .map((item) => {
      const term = `${item.label}：${item.value}`;
      const text = `移除後可得 ${grouped(item.count)} 筆`;
      return (
        `<li><span>${escapeHtml(term)}</span>` +
        `<a href="${escapeHtml(item.href)}" aria-label="${escapeHtml(`移除${term}，${text}`)}">${text}</a></li>`
      );
    })
    .join("");
}
