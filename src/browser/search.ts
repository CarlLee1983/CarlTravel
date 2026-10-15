export {};

interface SearchIndex {
  search(query: string): Promise<{
    results: { data(): Promise<{ url: string }> }[];
  }>;
}

const form = document.querySelector<HTMLFormElement>("#spot-search")!;
const input = form.querySelector<HTMLInputElement>('input[type="search"]')!;
const selects = [...form.querySelectorAll<HTMLSelectElement>("select")];
const cards = [...document.querySelectorAll<HTMLLIElement>("[data-spot-url]")];
const status = document.querySelector<HTMLElement>("#search-status")!;
const count = document.querySelector<HTMLElement>("#result-count")!;
const empty = document.querySelector<HTMLElement>("#no-results")!;
let index: Promise<SearchIndex> | undefined;
let request = 0;
let timer: number | undefined;

function showResults(matches: Set<string> | null) {
  let visible = 0;
  for (const card of cards) {
    const accepted =
      (!matches || matches.has(card.dataset.spotUrl!)) &&
      selects.every(
        (select) =>
          !select.value ||
          (select.name === "age"
            ? card.dataset.age!.split("|").includes(select.value)
            : card.dataset[select.name] === select.value),
      );
    card.hidden = !accepted;
    if (accepted) visible++;
  }
  count.textContent = String(visible);
  empty.hidden = visible > 0 || cards.length === 0;
  status.textContent =
    cards.length === 0 ? "目前尚無公開景點。" : `找到 ${visible} 個景點。`;
}

function update(delay = 0) {
  window.clearTimeout(timer);
  const current = ++request;
  const query = input.value.trim();
  if (!query || cards.length === 0) {
    showResults(null);
    return;
  }
  // Keep the list usable during loading or errors, without claiming it matches the query.
  showResults(null);
  status.textContent = "搜尋中…";
  timer = window.setTimeout(async () => {
    try {
      const path = "/pagefind/pagefind.js";
      index ??= import(/* @vite-ignore */ path);
      const result = await (await index).search(query);
      const urls = await Promise.all(
        result.results.map(async (hit) => (await hit.data()).url),
      );
      if (current !== request) return;
      showResults(new Set(urls));
    } catch {
      if (current !== request) return;
      index = undefined;
      showResults(null);
      status.textContent =
        "搜尋暫時無法使用，已顯示符合篩選的景點。可清除條件或稍後重試。";
    }
  }, delay);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  update();
});
input.addEventListener("input", (event) => {
  if (!(event instanceof InputEvent) || !event.isComposing) update(200);
});
input.addEventListener("compositionend", () => update(200));
for (const select of selects) select.addEventListener("change", () => update());
form.addEventListener("reset", () => {
  input.value = "";
  for (const select of selects) select.value = "";
  update();
});
form.querySelector<HTMLFieldSetElement>("fieldset")!.disabled = false;
document.querySelector<HTMLElement>("#search-help")!.hidden = true;
showResults(null);
