# 驗收狀態

本文件區分本機功能驗收與正式上線，不以虛構測試取代 Carl 的真實內容審閱。

| 範圍 | 狀態與證據 |
| --- | --- |
| 完整景點、資料結構與來源顯名 | 第 01–02 票已完成；內容與輸出正反測試見 tests/ 與 [內容模型](content-model.md) |
| 網站版面、授權、四頁導覽、搜尋篩選 | 第 03–04 票已完成；實際 Pagefind 查詢、鍵盤、五種寬度 axe 見 e2e/ |
| 新草稿與同 id 修訂隔離 | 第 05 票已完成；實際 dev→build、私人路徑與 Git 邊界見 tests/draft-preview.test.ts |
| 來源研究到預覽／送審 | 第 06 票本機實作；來源紀錄與關卡見 tests/research.test.ts，虛構流程見 tests/research-workflow.test.ts；不代表已處理真人提供的來源 |
| 私人原文／備註重疊 | 第 06 票提供可重用本機入口；12 字、引文含私人備註、多來源、核准不可讀、原文遺失與改標均以虛構案例驗證 |
| 發布 PR 與完整私人索引外洩檢查 | 第 07 票本機實作；隔離 Git 與模擬 GitHub、dev→正式建置及實際 Pagefind 正反測試；沒有真實發布 PR |
| PR CI 與 dry-run | 第 07 票提供 PR verification 與共用 verify 的真實 Wrangler dry-run；雲端 CI 執行待真實 PR |
| 自動部署、Cloudflare 與網域 | 第 08 票本機實作：main 專用部署流程、正式內容／隔離關卡與 Wrangler dry-run；依 Carl 選擇，雲端設定留待補齊，清單見 [部署文件](deployment.md)。尚未部署或驗證公開網域 |
| 真實來源完整上線 | 待第 09 票；正式內容目前為零，尚無真人來源的研究到上線證據 |

各票詳細執行證據見[工作票索引](../.scratch/carltravel-v1-build/README.md)及[開發驗收紀錄](development.md)。私人研究、完整原文及命中診斷留在本機，不附於本文件或公開報告。

## A 定稿與全站介面改善

2026-10-15：採天空藍與淡薰衣草紫配色、核准親子插畫與縮小品牌呈現，改善首頁、景點閱讀、關於與 404，以及搜尋狀態和鍵盤焦點。隔離環境完整關卡通過 64 個 Node 測試；最後介面修正後，格式、Astro 型別、48 個 Playwright 測試、正式建置、輸出／索引檢查與 Wrangler dry-run 通過。桌面／手機畫面已檢視，獨立審查無重大發現；沒有新增套件、正式景點或部署。詳見[公開介面](public-interface.md)。
