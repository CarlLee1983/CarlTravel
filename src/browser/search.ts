import { cardView } from "../content/list-card.ts";
import {
  ageNoteText,
  cardItemHtml,
  optionLabel,
  paginatorHtml,
  rangeText,
  recoveryItemsHtml,
  resultsButtonText,
  type RecoveryItem,
} from "../content/list-html.ts";
import { decodeList, type ListData, type ListEntry } from "../content/list.ts";
import {
  ageUnknownCount,
  filterKeys,
  filterOptions as optionsFor,
  queryList,
  removalOptions,
  type FilterKey,
  type FilterOptions,
  type ListQueryResult,
} from "../content/list-query.ts";
import { normalizeSearchText } from "../content/search.ts";
import {
  hasConditions,
  listHref,
  ownedParams,
  staticPath,
  type ListState,
} from "../content/list-url.ts";

interface SearchIndex {
  // 命中的 id 依相關度排序；不呼叫 data()（每筆都要載入一個片段檔）
  search(query: string): Promise<{ results: { id: string }[] }>;
}
interface ListReturn {
  scrollY: number;
  focusHref: string;
  filtersOpen: boolean;
}
// 網址上的原始條件，尚未經查詢模組驗證
type RawState = Omit<ListState, "page"> & { page: string | null };

const form = document.querySelector<HTMLFormElement>("#spot-search");
if (form) start(form);

function start(form: HTMLFormElement) {
  const input = form.querySelector<HTMLInputElement>('input[type="search"]')!;
  const selects = [...form.querySelectorAll<HTMLSelectElement>("select")];
  const results = document.querySelector<HTMLElement>(".results")!;
  const listEl = results.querySelector<HTMLElement>(".spots")!;
  const rangeEl = document.querySelector<HTMLElement>("#range-text")!;
  const orderNote = document.querySelector<HTMLElement>("#order-note")!;
  const empty = document.querySelector<HTMLElement>("#no-results")!;
  const pager = document.querySelector<HTMLElement>("#paginator")!;
  const skipPager = document.querySelector<HTMLElement>(".skip-pager")!;
  const active = document.querySelector<HTMLElement>("#active-filters")!;
  const filterOptions =
    document.querySelector<HTMLDetailsElement>("#filter-options")!;
  const filterCount = document.querySelector<HTMLElement>("#filter-count")!;
  const showResults =
    document.querySelector<HTMLButtonElement>("#show-results")!;
  const ageNote = document.querySelector<HTMLElement>("#age-note")!;
  const ageNoteLink = ageNote.querySelector<HTMLAnchorElement>("a")!;
  const recovery = document.querySelector<HTMLElement>("#recovery")!;
  const fields = [input, ...selects];
  // `/page/N/` 是靜態頁，讀不到查詢參數：在那裡套用條件一律導向 `/?…`
  const onStaticPage = Number(results.dataset.staticPage) > 1;
  const listUrl = results.dataset.listUrl!;
  const staticRange = rangeEl.textContent!;
  const staticOrder = orderNote.textContent!;
  let rows: ListEntry[] | undefined;
  let rowsRequest: Promise<ListEntry[]> | undefined;
  let index: Promise<SearchIndex> | undefined;
  let spotIds: Promise<Record<string, string>> | undefined;
  let request = 0;
  let timer: number | undefined;
  let pendingReturn: ListReturn | undefined;
  // 選項與筆數是否已由一次完整查詢（含文字命中）算過；之前只有載入列表資料後的初始版本
  let optionsFromQuery = false;

  // 列表 JSON：無條件頁面不下載，第一次聚焦搜尋框、打開篩選區或帶條件進站時才抓
  function loadRows() {
    rowsRequest ??= fetch(listUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`列表 JSON ${response.status}`);
        return response.json() as Promise<ListData>;
      })
      .then((data) => (rows = decodeList(data)))
      .catch((error) => {
        rowsRequest = undefined;
        throw error;
      });
    return rowsRequest;
  }
  const warm = () =>
    void loadRows()
      .then(() => {
        // 有文字查詢時，筆數要等含命中的那次查詢才算，這裡先不動
        if (!optionsFromQuery && !input.value.trim())
          showOptions(optionsFor(rows!, stateFromFields()));
      })
      .catch(() => {});

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
      const link = [...listEl.querySelectorAll<HTMLAnchorElement>("a")].find(
        (element) => element.getAttribute("href") === saved.focusHref,
      );
      if (link) link.focus({ preventScroll: true });
      window.scrollTo({ top: saved.scrollY, behavior: "instant" });
    });
  }

  // 換頁後從列表頂端讀起：捲到列表開頭，焦點移到範圍文字
  function focusRange() {
    results.scrollIntoView({ block: "start", behavior: "instant" });
    rangeEl.focus({ preventScroll: true });
  }

  const conditionsFrom = (value: (name: string) => string) =>
    Object.fromEntries(filterKeys.map((key) => [key, value(key)])) as Record<
      FilterKey,
      string
    >;

  const clearField = (name: string) => {
    const field = fields.find((item) => item.name === name);
    if (field) field.value = "";
  };

  function stateFromFields(): RawState {
    const value = (name: string) =>
      fields.find((field) => field.name === name)?.value.trim() ?? "";
    return {
      query: value("query"),
      ...conditionsFrom(value),
      page: null,
    };
  }

  function stateFromUrl(): RawState {
    const params = new URL(location.href).searchParams;
    const value = (name: string) => (params.get(name) ?? "").trim();
    return {
      query: value("query"),
      ...conditionsFrom(value),
      page: params.get("page"),
    };
  }

  // 每個選項標上選了之後剩幾筆；0 筆的停用，沒有區分作用的維度整個隱藏。
  // 選項內容沒變就只改文字與停用狀態，不重建（避免打斷正在操作的下拉選單）。
  function showOptions(view: FilterOptions) {
    for (const select of selects) {
      const dimension = view[select.name as FilterKey];
      select.closest<HTMLElement>(".filter")!.hidden = !dimension.visible;
      const current = [...select.options].slice(1);
      const same =
        current.length === dimension.options.length &&
        current.every(
          (option, i) => option.value === dimension.options[i]!.value,
        );
      const options = same
        ? current
        : dimension.options.map(() => document.createElement("option"));
      dimension.options.forEach((item, i) => {
        const option = options[i]!;
        const label = optionLabel(item.value, item.count);
        option.value = item.value;
        if (option.textContent !== label) option.textContent = label;
        option.disabled = item.disabled;
      });
      if (!same) select.replaceChildren(select.options[0]!, ...options);
      select.value = dimension.selected;
    }
  }

  function showFields(state: ListState | RawState) {
    input.value = state.query;
    for (const select of selects) {
      const value = state[select.name as FilterKey];
      select.value = [...select.options].some(
        (option) => option.value === value,
      )
        ? value
        : "";
    }
  }

  // 只動列表自己的參數；其餘參數與錨點保留。換頁用 push，其他一律 replace。
  function writeUrl(
    state: ListState,
    mode: "replace" | "push" = "replace",
    clearReturn = true,
  ) {
    const url = new URL(location.href);
    for (const name of ownedParams) url.searchParams.delete(name);
    const target = new URL(listHref(state), location.origin);
    for (const [name, value] of target.searchParams)
      url.searchParams.set(name, value);
    if (url.href === location.href) return;
    const next = { ...history.state };
    if (clearReturn) delete next.carlTravelList;
    if (mode === "push") history.pushState(next, "", url);
    else history.replaceState(next, "", url);
  }

  const labelOf = (key: FilterKey | "query") =>
    key === "query"
      ? "搜尋"
      : form.querySelector<HTMLLabelElement>(`label[for="filter-${key}"]`)!
          .textContent!;

  let chipKey = "";
  function showActiveFilters() {
    // 內容沒變就不重建，避免換掉使用者正要操作的按鈕
    const key = JSON.stringify(fields.map((field) => field.value.trim()));
    if (key === chipKey) return;
    chipKey = key;
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

  function setStatus(
    state: "ready" | "loading" | "error",
    text: string,
    busy = state === "loading",
  ) {
    rangeEl.dataset.state = state;
    // 文字沒變就不重寫，避免讓朗讀器重複播報同一句
    if (rangeEl.textContent !== text) rangeEl.textContent = text;
    listEl.setAttribute("aria-busy", String(busy));
  }

  // 拿掉 cleared 內的條件後的列表網址（回到第 1 頁）
  function hrefWithout(state: ListState, cleared: readonly string[]) {
    const next = { ...state, page: 1 };
    for (const key of cleared) next[key as FilterKey | "query"] = "";
    return listHref(next);
  }

  function showResult(
    result: ListQueryResult,
    state: ListState,
    byRelevance: boolean,
    notice = "",
    extras: { ageUnknown: number; recovery: RecoveryItem[] } = {
      ageUnknown: 0,
      recovery: [],
    },
  ) {
    listEl.innerHTML = result.rows
      .map((entry) => cardItemHtml(cardView(entry)))
      .join("");
    setStatus(
      notice ? "error" : "ready",
      notice
        ? `${rangeText(result.range)} · ${notice}`
        : rangeText(result.range),
      false,
    );
    orderNote.textContent = byRelevance ? "依相關度排序" : staticOrder;
    empty.hidden = result.range.total > 0;
    recovery.innerHTML = recoveryItemsHtml(extras.recovery);
    ageNote.hidden = extras.ageUnknown === 0;
    if (extras.ageUnknown > 0) {
      ageNoteLink.textContent = ageNoteText(extras.ageUnknown);
      ageNoteLink.href = hrefWithout(state, ["age"]);
    }
    showResults.textContent = resultsButtonText(result.range.total);
    const paged = result.totalPages > 1;
    pager.hidden = skipPager.hidden = !paged;
    pager.innerHTML = paged
      ? paginatorHtml(result.conditions.page, result.totalPages, (page) =>
          listHref({ ...state, page }),
        )
      : "";
  }

  async function searchHits(query: string) {
    const path = "/pagefind/pagefind.js";
    index ??= import(/* @vite-ignore */ path);
    spotIds ??= fetch("/pagefind/spot-ids.json").then((response) => {
      if (!response.ok) throw new Error(`景點對照表 ${response.status}`);
      return response.json() as Promise<Record<string, string>>;
    });
    try {
      // 索引裡「臺」已統一成「台」，查詢也要先轉。命中 id 用建置時產生的對照表換成景點 id，
      // 不逐筆載入片段檔（6,000 筆時會是上千個請求）。
      const [found, ids] = await Promise.all([
        index.then((pagefind) => pagefind.search(normalizeSearchText(query))),
        spotIds,
      ]);
      return found.results.flatMap((hit) => ids[hit.id] ?? []);
    } catch (error) {
      index = spotIds = undefined;
      throw error;
    }
  }

  async function run(
    current: number,
    source: "edit" | "url",
    raw: RawState,
    afterPageChange: boolean,
  ) {
    // 狀態依序是：載入列表資料（載入中）→ 等索引回應（搜尋中…）→ 結果。
    // 兩個請求同時發出，但「搜尋中…」只在列表資料到手之後、索引還沒回來時顯示，
    // 所以列表資料較慢時不會卡在「載入中」，也不會跳過搜尋中的狀態。
    const wantsText = raw.query !== "";
    let searchDone = !wantsText;
    const search = wantsText
      ? Promise.allSettled([searchHits(raw.query)]).then(([outcome]) => {
          searchDone = true;
          return outcome;
        })
      : null;
    if (!rows) setStatus("loading", "載入中");
    else if (wantsText) setStatus("loading", "搜尋中…");
    const [loaded] = await Promise.allSettled([loadRows()]);
    if (current !== request) return;
    if (loaded.status === "rejected" || !rows) {
      setStatus(
        "error",
        "篩選資料暫時無法載入，目前顯示未篩選的第 1 頁。請重新整理後再試。",
      );
      return;
    }
    if (!searchDone) setStatus("loading", "搜尋中…");
    const found = search ? await search : null;
    if (current !== request) return;
    const hits = found?.status === "fulfilled" ? found.value : null;
    const result = queryList(rows, { ...raw, hits });
    const state: ListState = { ...raw, ...result.conditions };
    // 沒有任何條件的第 2 頁以後有靜態網址，不在 `/` 上渲染
    if (!hasConditions(state) && state.page > 1) {
      location.replace(staticPath(state.page));
      return;
    }
    const conditions = { ...result.conditions, hits };
    showOptions(optionsFor(rows, conditions));
    optionsFromQuery = true;
    showFields(state);
    showActiveFilters();
    if (source === "edit") writeUrl(state);
    else if (result.needsUrlReplace) writeUrl(state, "replace", false);
    showResult(
      result,
      state,
      hits !== null,
      found?.status === "rejected"
        ? "搜尋暫時無法使用，已顯示符合篩選的景點。可清除條件或稍後重試。"
        : "",
      {
        ageUnknown: ageUnknownCount(rows, conditions),
        recovery:
          result.range.total === 0
            ? removalOptions(rows, { ...conditions, query: state.query }).map(
                (option) => ({
                  label: labelOf(option.key),
                  value: option.value,
                  count: option.count,
                  href: hrefWithout(state, option.cleared),
                }),
              )
            : [],
      },
    );
    if (afterPageChange) focusRange();
    else restorePosition();
  }

  function update(source: "edit" | "url", delay = 0, afterPageChange = false) {
    window.clearTimeout(timer);
    const current = ++request;
    const raw = source === "edit" ? stateFromFields() : stateFromUrl();
    if (source === "edit") pendingReturn = undefined;
    else showFields(raw);
    showActiveFilters();
    const conditioned =
      hasConditions({ ...raw, page: 1 }) || (source === "url" && raw.page);
    if (onStaticPage) {
      // 靜態頁讀不到查詢參數：條件改走 `/?…`，由那裡的前端渲染
      if (source === "edit") {
        if (hasConditions({ ...raw, page: 1 }))
          location.assign(listHref({ ...raw, page: 1 }));
      } else if (conditioned) {
        location.replace(listHref({ ...raw, page: Number(raw.page) || 1 }));
      } else restorePosition();
      return;
    }
    if (!conditioned && !rows) {
      // 沒有條件也還沒載入列表資料：畫面就是靜態第 1 頁
      writeUrl({ ...raw, page: 1 }, "replace", source === "edit");
      setStatus("ready", staticRange);
      restorePosition();
      return;
    }
    timer = window.setTimeout(
      () => void run(current, source, raw, afterPageChange),
      delay,
    );
  }

  // 「查看 N 筆結果」：收合篩選區，捲到範圍文字並移入焦點。改選項本身不捲動。
  showResults.addEventListener("click", () => {
    filterOptions.open = false;
    focusRange();
  });

  // 年齡未標示說明與無結果的移除連結都是真連結（可複製、可新分頁開啟）；
  // 一般點擊在同一份文件內套用，留下一筆瀏覽紀錄，焦點移到範圍文字（清除條件則回搜尋框）
  results.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>(
      "#age-note a[href], #no-results a[href]",
    );
    if (
      !link ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    const state = { ...history.state };
    delete state.carlTravelList;
    history.pushState(state, "", link.href);
    update("url");
    if (link.id === "clear-all") input.focus();
    else rangeEl.focus({ preventScroll: true });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update("edit");
  });
  input.addEventListener("input", (event) => {
    if (onStaticPage) return;
    if (!(event instanceof InputEvent) || !event.isComposing)
      update("edit", 200);
  });
  input.addEventListener("compositionend", () => {
    if (!onStaticPage) update("edit", 200);
  });
  input.addEventListener("focus", warm, { once: true });
  filterOptions.addEventListener("toggle", () => {
    if (filterOptions.open) warm();
  });
  for (const select of selects)
    select.addEventListener("change", () => {
      // 行政區屬於縣市：改縣市就清掉行政區（即使新縣市有同名的區）
      if (select.name === "county") clearField("district");
      update("edit");
    });
  active.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-filter]",
    );
    const field = fields.find((item) => item.name === button?.dataset.filter);
    if (!field) return;
    field.value = "";
    if (field.name === "county") clearField("district");
    update("edit");
    input.focus();
  });
  form.addEventListener("reset", () => {
    const recoverFocus =
      empty.contains(document.activeElement) ||
      active.contains(document.activeElement);
    for (const field of fields) field.value = "";
    update("edit");
    if (recoverFocus) input.focus();
  });

  // 分頁器：帶條件的連結（`/?…`）在同一份文件內換頁並留下瀏覽紀錄；
  // 靜態連結（`/`、`/page/N/`）照一般導覽，新頁面載入時再把焦點移到範圍文字。
  pager.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[href]");
    if (
      !link ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !link.getAttribute("href")!.startsWith("/?")
    )
      return;
    event.preventDefault();
    const state = { ...history.state };
    delete state.carlTravelList;
    history.pushState(state, "", link.href);
    update("url", 0, true);
  });

  // 返回位置屬於這一筆瀏覽紀錄，不用共用的裝置儲存
  results.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[href]");
    if (!link || !listEl.contains(link)) return;
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
  const restoreFromUrl = () => {
    readReturnState();
    update("url");
  };
  window.addEventListener("popstate", restoreFromUrl);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) restoreFromUrl();
  });

  form.querySelector<HTMLFieldSetElement>("fieldset")!.disabled = false;
  document.querySelector<HTMLElement>(".search-help")!.hidden = true;
  restoreFromUrl();
  // 從列表的另一頁用分頁器過來時，從這一頁的開頭讀起
  const arrival = performance.getEntriesByType("navigation")[0] as
    PerformanceNavigationTiming | undefined;
  if (arrival?.type === "navigate" && document.referrer) {
    const from = new URL(document.referrer);
    if (
      from.origin === location.origin &&
      (from.pathname === "/" || from.pathname.startsWith("/page/")) &&
      from.href !== location.href &&
      !pendingReturn
    )
      focusRange();
  }
}
