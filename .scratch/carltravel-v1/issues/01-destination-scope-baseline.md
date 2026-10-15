# 目的地、內容邊界與技術基線

Type: grilling
Status: resolved
Assignee: Carl

## Question

CarlTravel v1 的地圖要走到哪裡為止？景點、來源、草稿與研究紀錄各自的邊界在哪？三類資訊（官方、原作者心得、Agent 建議）與未知、衝突在頁面上如何呈現？技術、部署與發布權限沿用 CarlKitchen 或 CarlStack 的哪些部分？

## Answer

以下由 Carl 於 2026-10-15 確認。名詞定義見 [CONTEXT.md](../../../CONTEXT.md)。

### 目的地與範圍

- 地圖的終點是一份可交給 `/to-spec` → `/to-tickets` → `/implement` 的 v1 規格。地圖本身不建站，也不部署。
- 「用一個真實網址走完研究 → 草稿 → 審閱 → 發布」是實作階段的驗收條件，不在地圖內執行。
- 景點是可親子造訪的**台灣**固定地點。餐廳、住宿只出現在周邊安排，不單獨成為景點；有日期的活動不算景點。
- 內容只用繁體中文（台灣用語），不做多語系。v1 不放景點照片，只放文字與地圖或官方連結。

### 景點身分

- 同一景點以「官方名稱 + 地址」識別。新來源明確相符時補充既有景點；部分相符時標示「同一性待確認」，由 Carl 選擇合併或分開。
- v1 不做園區與子景點的從屬關係。子景點若值得單獨成篇，就各自成為景點並互相提及。

### 內容呈現

- 景點頁依需求項目固定分節。官方資訊（交通與停車、開放時間與費用、親子設施）逐條附來源連結；原作者心得與 Agent 建議各自獨立成節並加標示，三類資訊不混寫在同一段落。
- 查證日期記在每個官方資訊分節上；補充新來源時，只更新實際重查過的分節。build 時，查證日期超過 12 個月的分節顯示「資料可能過期」。v1 不做自動重新查證。
- 公開頁會顯示三種狀態：「官方未公布」、「資料不一致」（並列各方說法與來源，並附「出發前請洽 X」）、「原文無法讀取」（記在來源上）。
- 親子與無障礙資訊用固定清單：推車友善、哺乳室、親子廁所、雨天備案、建議年齡、無障礙設施。每項只能填「有」「無」「未知」，填「有」或「無」都必須附來源，預設為「未知」，不得從照片或心得推論。清單之外另有自由文字欄。
- 「跟孩子一起看」是選填分節。其中的事實需附可查來源；觀察活動屬於 Agent 建議，要標示出來。
- 原作者心得以轉述摘要呈現並署名、附連結；直接引用每段約 50 字以內，每個來源最多兩段。
- 公開頁列出採用的來源（標題、連結、作者或網站、讀取日期），但不放 Carl 的備註和研究紀錄。

### 草稿、研究紀錄與發布

- 正式景點放在 `content/spots/<id>/`，草稿放在 gitignored 的 `drafts/spots/<id>/`，兩者用同一個 schema。開發模式同時載入兩者，並在草稿上加橫幅；正式 build 只讀 `content/`。是否為草稿由檔案位置決定，不用 `draft` 欄位。
- 研究紀錄放在 gitignored 的 `research/<來源 id>/`，內容包括原文摘錄（不存全文）、Carl 的備註、官方查詢紀錄、衝突與未知清單，以及同一性判斷。理由見 [ADR-0001](../../../docs/adr/0001-drafts-and-research-stay-local.md)。
- Carl 在本機預覽站審閱草稿。他在對話中確認後，Agent 在分支上把草稿移入 `content/`，以 `gh pr create --draft` 開 PR，CI 全綠後轉成 ready。**Carl 合入 PR 才算發布**。Agent 不推 main、不合入 PR、不執行部署。

### 技術基線

- 沿用 CarlKitchen：Astro 靜態輸出、pnpm、Node 內建測試、Playwright+axe、限定範圍的 Pagefind、白名單 sitemap、共用 verify action 的 CI/deploy、Workers Static Assets，以及 build 輸出的外洩檢查。不沿用菜譜 schema、配菜、節氣與插畫流程。
- 這張地圖用本機 Markdown 管理，放在 `.scratch/carltravel-v1/`，並且 commit。地圖只寫規劃與決策，不寫私人備註。
- GitHub public repo `CarlLee1983/carltravel` 與網域 `carltravel.gravito.dev` 留到實作階段才建立。
- `carltravel-research` skill 放在 `.claude/skills/carltravel-research/`，隨公開 repo commit；skill 內只寫工作規則。
