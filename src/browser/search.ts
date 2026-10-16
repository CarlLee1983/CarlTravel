export {};

interface SearchIndex {
  search(query: string): Promise<{
    results: { data(): Promise<{ url: string }> }[];
  }>;
}
interface ListReturn {
  scrollY: number;
  focusHref: string;
  filtersOpen: boolean;
}

const form = document.querySelector<HTMLFormElement>("#spot-search")!;
const input = form.querySelector<HTMLInputElement>('input[type="search"]')!;
const selects = [...form.querySelectorAll<HTMLSelectElement>("select")];
const cards = [...document.querySelectorAll<HTMLLIElement>("[data-spot-url]")];
const results = document.querySelector<HTMLElement>(".results")!;
const resultList = document.querySelector<HTMLElement>(".spots") ?? results;
const status = document.querySelector<HTMLElement>("#search-status")!;
const count = document.querySelector<HTMLElement>("#result-count")!;
const empty = document.querySelector<HTMLElement>("#no-results")!;
const active = document.querySelector<HTMLElement>("#active-filters")!;
const filterOptions =
  document.querySelector<HTMLDetailsElement>("#filter-options")!;
const filterCount = document.querySelector<HTMLElement>("#filter-count")!;
const fields = [input, ...selects];
const parameterNames = ["query", "county", "kind", "setting", "age"];
let index: Promise<SearchIndex> | undefined;
let request = 0;
let timer: number | undefined;
let pendingReturn: ListReturn | undefined;

function readReturnState() {
  const value: unknown = history.state?.carlTravelList;
  pendingReturn = undefined;
  if (typeof value !== "object" || value === null) return;
  const saved = value as Partial<ListReturn>;
  if (
    typeof saved.scrollY === "number" &&
    Number.isFinite(saved.scrollY) &&
    saved.scrollY >= 0 &&
    typeof saved.focusHref === "string"
  ) {
    pendingReturn = {
      scrollY: saved.scrollY,
      focusHref: saved.focusHref,
      filtersOpen: saved.filtersOpen === true,
    };
    filterOptions.open = pendingReturn.filtersOpen;
  }
}

function restorePosition() {
  if (!pendingReturn) return;
  const saved = pendingReturn;
  pendingReturn = undefined;
  const generation = request;
  requestAnimationFrame(() => {
    if (generation !== request) return;
    const link = [...results.querySelectorAll<HTMLAnchorElement>("a")].find(
      (element) => element.getAttribute("href") === saved.focusHref,
    );
    if (link && !link.closest("[hidden]")) link.focus({ preventScroll: true });
    window.scrollTo({ top: saved.scrollY, behavior: "instant" });
  });
}

function writeUrl(clearReturn = true) {
  const url = new URL(location.href);
  // Own only these parameters; leave unrelated URL state and anchors intact.
  for (const name of parameterNames) url.searchParams.delete(name);
  for (const field of fields) {
    const value = field.value.trim();
    if (value) url.searchParams.set(field.name, value);
  }
  const state = { ...history.state };
  if (clearReturn) delete state.carlTravelList;
  history.replaceState(state, "", url);
}

function readUrl() {
  const params = new URL(location.href).searchParams;
  input.value = params.get("query") ?? "";
  for (const select of selects) {
    const value = params.get(select.name) ?? "";
    select.value = [...select.options].some((option) => option.value === value)
      ? value
      : "";
  }
  readReturnState();
  writeUrl(false);
}

function showActiveFilters() {
  active.replaceChildren();
  for (const field of fields) {
    const value = field.value.trim();
    if (!value) continue;
    const label =
      field === input
        ? "搜尋"
        : form.querySelector<HTMLLabelElement>(`label[for="${field.id}"]`)!
            .textContent!;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.filter = field.name;
    button.setAttribute("aria-label", `移除${label}：${value}`);
    button.append(document.createTextNode(`${label}：${value}`));
    const cross = document.createElement("span");
    cross.setAttribute("aria-hidden", "true");
    cross.textContent = "×";
    button.append(cross);
    active.append(button);
  }
  active.hidden = active.childElementCount === 0;
  const selected = selects.filter((select) => select.value).length;
  filterCount.textContent = selected ? `（${selected} 項）` : "";
}

function showResults(matches: Set<string> | null, settled = true) {
  status.dataset.state = "ready";
  resultList.setAttribute("aria-busy", "false");
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
  if (settled) restorePosition();
}

function update(delay = 0, syncUrl = true) {
  window.clearTimeout(timer);
  if (syncUrl) {
    pendingReturn = undefined;
    writeUrl();
  }
  showActiveFilters();
  const current = ++request;
  const query = input.value.trim();
  if (!query || cards.length === 0) {
    showResults(null);
    return;
  }
  // While the index loads, keep browsing available without claiming a query match.
  showResults(null, false);
  status.dataset.state = "loading";
  status.textContent = "搜尋中…";
  resultList.setAttribute("aria-busy", "true");
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
      status.dataset.state = "error";
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
active.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("button[data-filter]");
  const field = fields.find((item) => item.name === button?.dataset.filter);
  if (!field) return;
  field.value = "";
  update();
  input.focus();
});
form.addEventListener("reset", () => {
  const recoverFocus =
    empty.contains(document.activeElement) ||
    active.contains(document.activeElement);
  for (const field of fields) field.value = "";
  update();
  if (recoverFocus) input.focus();
});

// The return position belongs to this browser history entry, not a shared device store.
results.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>("a[href]");
  if (!link || !cards.some((card) => card.contains(link))) return;
  history.replaceState(
    {
      ...history.state,
      carlTravelList: {
        scrollY: window.scrollY,
        focusHref: link.getAttribute("href")!,
        filtersOpen: filterOptions.open,
      },
    },
    "",
  );
});
window.addEventListener("popstate", () => {
  readUrl();
  update(0, false);
});
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  readUrl();
  update(0, false);
});
form.querySelector<HTMLFieldSetElement>("fieldset")!.disabled = false;
document.querySelector<HTMLElement>("#search-help")!.hidden = true;
readUrl();
update(0, false);
