# v1 規格與驗收條件

Type: grilling
Status: open
Blocked by: 05, 06, 07, 09, 10

## Question

把前面各票的決定整合成一份可以交給 `/to-spec` 的 v1 規格，並把驗收條件定清楚：

- 驗收的主軸是：Carl 提供一個真實網址，完整走過「研究 → 草稿 → 本機審閱 → PR → 合入 → 上線」；同時確認草稿不出現在正式站、sitemap 與 Pagefind 索引中。
- `docs/architecture.md` 的邊界清單要列入哪些項目，例如內容 schema、草稿目錄邊界、發布權限、skill 的位置。
- `AGENTS.md` 中「代理權限」與「內容製作入口」兩節的確切內容。
- 依票 06，把票 07 定下的頁面清單填進 axe 與水平捲動檢查的涵蓋範圍；驗收時也要確認本機關卡（照抄、備註、草稿外洩比對）在開 PR 前確實擋得下。
- 實作順序：先建骨架，再做 skill，最後跑首篇真實內容。部署所需的設定（GitHub repo、Cloudflare、網域）排在哪一步。
