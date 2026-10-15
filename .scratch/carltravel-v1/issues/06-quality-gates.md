# 自動品質檢查與發布關卡

Type: grilling
Status: resolved
Assignee: Carl
Blocked by: 04, 05

## Question

品質規則要分成兩類：哪些由 `check:content` 或 CI 機械性擋下、阻止合入與部署；哪些只寫在 skill 裡，交給 Agent 自查和 Carl 審閱？候選規則包括：

- 外洩檢查：build 輸出中不得出現任何草稿 id、研究紀錄內容或私人備註標記。
- 照抄比對：參考 CarlKitchen ADR 0009 的「12 字以上相同片段」門檻，在景點文字與 `research/` 原文摘錄之間比對。但 CI 讀不到 `research/`，所以要決定是在本機執行還是在 PR 前執行。
- 結構檢查：官方資訊必須逐條附來源；分節必須有查證日期；有／無項目必須附來源；直接引用的長度上限。
- 過期提示（12 個月）只是顯示，不擋 build。
- 照抄比對的比對對象：依票 05，`research/<來源 id>/original.txt` 在本機存有原文全文，這裡只需要決定何時、何處執行比對。
- 圖片：v1 是否直接禁止內容目錄出現圖片檔。
- 無障礙與版面：Playwright+axe 涵蓋哪些頁面。

另外要決定：哪些檢查在 PR 上跑、哪些在 deploy 前跑，以及失敗時如何回報給 Carl。

## Answer

以下由 Carl 於 2026-10-15 確認。整體原則：能在公開 repo 內容上判斷的規則，放進 CI，擋合入與部署；必須讀到草稿或研究紀錄才能判斷的規則，只能在本機跑，由 `carltravel-publish` 在開 PR 前擋下（理由見 [ADR-0001](../../../docs/adr/0001-drafts-and-research-stay-local.md)）；無法機械判斷的寫作規則，留在 skill 裡，交給 Agent 自查與 Carl 審閱。

### CI：PR 與部署

- PR 跑完整的 `verify`，項目同 CarlKitchen：format、astro check、正式建置、`check:content`、unit test、e2e（含 axe）、`wrangler deploy --dry-run`。
- 部署先跑同一份 `verify`，再以正式內容重建，對建置輸出跑一次 `check:content`。
- 不設景點數量的上線門檻（CarlKitchen 要求至少 12 道菜），只要求至少有一個已發布景點。
- 失敗時就是 PR 上的紅燈，沿用 GitHub 的通知，不另設通知管道。

### `check:content` 的錯誤（擋 build）

- schema 已擋下的錯誤：ref 指向不存在的官方出處或來源、事實沒附出處、引文段數或長度超限。
- 引文長度：schema 的硬上限是 60 字，作為容忍值；skill 要求每段寫在約 50 字以內（票 03）。兩個數字的意義都寫進 skill。
- `district` 不在官方行政區清單內。
- `officialRefs` 或 `sources` 中有項目沒被任何地方引用。
- 公開文字中，引文以外出現「我」「我們」。
- `content/spots/` 下出現任何圖片檔（v1 不放照片）。
- 外洩的結構檢查：dist、sitemap、Pagefind 索引中的每個景點都必須對應 `content/spots/` 的某個 id；輸出中不得出現「修訂中」橫幅、`research/` 或 `drafts/` 字樣。

### `check:content` 的警告（不擋）

- 任一分節的 `checkedAt` 超過 12 個月：公開頁顯示過期提示，`check:content` 只印警告，不擋 build，也不擋部署。

### 本機關卡（`carltravel-publish` 開 PR 前執行）

- 照抄比對：以 12 字以上相同片段為門檻，比對景點的公開文字與 `research/<來源 id>/original.txt`，同時也比對 `source.md` 中 Carl 的備註。research skill 送審時先跑一次，寫進送審清單；發布前再跑一次，因為 Carl 審閱時可能改過文字。結果附在 PR 說明。
- 草稿外洩：在 `drafts/` 存在的狀態下跑正式建置，確認未發布的草稿 id 都不在輸出中。
- `drafts/` 下的圖片檔，比照 `content/` 報錯。
- 任一項失敗時，`carltravel-publish` 停下，在對話中逐條列出問題（檔案、欄位、原因），不開 PR。

### 只寫在 skill 裡的規則

不寫保證式的宣稱、送出前的去 AI 味自查、「跟孩子一起看」的撰寫條件（票 05），以及 Carl 的備註不得進入公開內容（機械性部分由上面的備註比對處理）。

### 無障礙與版面

票 07 列出的每一種頁面，都以 fixture 景點跑 axe，要求零違規，並檢查 360、390、430、1366、1920 寬度沒有水平捲動，做法同 CarlKitchen。具體頁面清單在票 08 整合時依票 07 填入。
