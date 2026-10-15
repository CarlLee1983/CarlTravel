# 07: 審閱通過到發布 PR

**What to build:** Carl 審閱通過指定草稿後，Agent 經完整本機關卡準備可公開的 draft PR，CI通過後才轉ready。

**Blocked by:** [04：搜尋與四種篩選](04-search-and-filters.md)、[06：來源研究到送審](06-research-to-review.md)

**Status:** completed

**Parent:** [CarlTravel v1 規格](../../carltravel-v1/issues/11-carltravel-v1-spec.md)

- [x] 交付 carltravel-publish skill，核對指定內容的Carl審閱證據與每個不可讀來源的例外證據；未核准內容停止，不由Agent核准。
- [x] 重用研究票的重疊關卡並在審閱修改後重新執行；同時驗證schema、草稿圖片、來源資料完整性及正式建置隔離，任一失敗不開PR。
- [x] 整合頁面、sitemap與實際Pagefind索引的新草稿及同id修訂測試；新id不出現、舊正式頁保留、修訂文字不洩漏，含開發後重建情境。
- [x] 檢查待公開變更與報告不含私人備註、原文全文或私人命中文字；PR僅包含核准公開內容、可公開送審摘要與逐來源檢查狀態。
- [x] 一次審閱通過的草稿一個PR；在工作分支準備提交／推送及draft PR，CI全綠且修改完成才ready。新增修改重跑關卡，已合入後從最新主分支另開PR。
- [x] 先讓PR CI執行完整共用verify：format、astro check、建置、內容檢查、unit、e2e／axe及wrangler dry-run；部署票沿用此驗證，不把完整PR檢查延後到部署。
- [x] Agent不推main、不合入PR、不正式部署或回滾。用隔離本機fixture與模擬GitHub邊界驗證成功與失敗行為，不用假內容建立真實公開PR。
- [x] 補齊內容製作入口、代理權限、本機發布檢查及PR操作文件；完整正式基礎設施與真實PR留後續票。


## 驗收證據

2026-10-15：完成 carltravel-publish skill、核准批次與正式基準 hash、本機關卡、標準 YAML 準備、整段 Git 歷史檢查、draft／ready GitHub 邊界，以及完整 PR verification workflow。所有核准、來源與 GitHub 操作驗收使用隔離本機 fixture／模擬遠端，未建立真實公開 PR。

`E2E_PORT=4337 pnpm verify` 完整通過：58 個 Node 測試、43 個 Playwright 案例、format／astro check／內容、正式建置／輸出／實際 Pagefind 與 Wrangler dry-run。獨立審查後修正固定 commit 推送、私人錯誤輸出、ready 後摘要核對及孤立草稿連結四項問題。後續反覆發布測試另重現 Pagefind 原生寫檔關閉競爭，改由 Node 等待 getFiles 的檔案資料完成寫入。

最終修正後：10 個相關 Node 測試（發布、草稿預覽、索引重建）、10 個搜尋 Playwright 案例、型別檢查（零 errors／warnings／hints）、正式重建、輸出／實際索引與 Wrangler dry-run 均通過；沿用未變動頁面其餘完整瀏覽器結果。標準軸四項 finding 與延伸索引問題已由原 reviewer 複查結案；規格軸無實質 finding。

新增固定版本 Wrangler 及 workerd 安裝許可是為真實 dry-run 所需，未加入雲端密鑰或正式部署。操作與回復見 [docs/publishing.md](../../../docs/publishing.md)。下一張為第 08 票；真實 PR CI、基礎設施及真人來源上線仍待後續驗收。
