# 07: 審閱通過到發布 PR

**What to build:** Carl 審閱通過指定草稿後，Agent 經完整本機關卡準備可公開的 draft PR，CI通過後才轉ready。

**Blocked by:** [04：搜尋與四種篩選](04-search-and-filters.md)、[06：來源研究到送審](06-research-to-review.md)

**Status:** ready-for-agent

**Parent:** [CarlTravel v1 規格](../../carltravel-v1/issues/11-carltravel-v1-spec.md)

- [ ] 交付 carltravel-publish skill，核對指定內容的Carl審閱證據與每個不可讀來源的例外證據；未核准內容停止，不由Agent核准。
- [ ] 重用研究票的重疊關卡並在審閱修改後重新執行；同時驗證schema、草稿圖片、來源資料完整性及正式建置隔離，任一失敗不開PR。
- [ ] 整合頁面、sitemap與實際Pagefind索引的新草稿及同id修訂測試；新id不出現、舊正式頁保留、修訂文字不洩漏，含開發後重建情境。
- [ ] 檢查待公開變更與報告不含私人備註、原文全文或私人命中文字；PR僅包含核准公開內容、可公開送審摘要與逐來源檢查狀態。
- [ ] 一次審閱通過的草稿一個PR；在工作分支準備提交／推送及draft PR，CI全綠且修改完成才ready。新增修改重跑關卡，已合入後從最新主分支另開PR。
- [ ] 先讓PR CI執行完整共用verify：format、astro check、建置、內容檢查、unit、e2e／axe及wrangler dry-run；部署票沿用此驗證，不把完整PR檢查延後到部署。
- [ ] Agent不推main、不合入PR、不正式部署或回滾。用隔離本機fixture與模擬GitHub邊界驗證成功與失敗行為，不用假內容建立真實公開PR。
- [ ] 補齊內容製作入口、代理權限、本機發布檢查及PR操作文件；完整正式基礎設施與真實PR留後續票。
