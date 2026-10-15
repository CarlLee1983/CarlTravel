# 自動部署與上線驗收

## 現況與邊界

第 08 票完成本機工作流程與 dry-run；依 Carl 本次選擇，雲端設定留待補齊。目前正式景點為零，沒有正式部署、網域綁定或公開頁驗收證據。不要把本機測試、GitHub environment 的 URL 或工作流程綠燈當作網站已上線。

目的地固定為既有 `CarlLee1983/CarlTravel`、Worker `carltravel` 與 `https://carltravel.gravito.dev`。Wrangler 的 custom-domain 設定是預定部署設定，尚未確認遠端 zone、既有 hostname 綁定及 Worker 狀態，不能據此宣稱設定已生效。沒有新增 repo、複製本機登入 token 或新增套件。

## 流程

1. Carl 審閱並合入 PR；`main` push 觸發 Production deployment。沒有手動 workflow_dispatch、PR 部署或 Agent 正式部署入口。部署 job 額外限定 repo、main 與原始／重跑觸發者 `CarlLee1983`；其他人觸發的 main 更新不會部署。這是防誤觸限制，仍需下方分支保護確保走 PR。
2. 無 Cloudflare 憑證的 verify job 執行與 PR 相同的 `pnpm verify`。零正式景點可以通過；fixture E2E 在 `dist-fixture/`，不會被部署。
3. deploy job 使用獨立 runner，checkout 同一個 `github.sha`。`pnpm prepare:deployment` 依序正式重建 `dist/`、執行部署檢查、Wrangler dry-run，不下載或重用 verify 的產物。
4. 部署檢查要求至少一個正式景點，拒絕已知 fixture id／名稱、虛構標記與 example.org/com/net 來源；沿用正式頁面、sitemap、實際 Pagefind 與私人目錄隔離檢查。程式不能判斷任意改寫文字是否真實；真人內容仍須依發布流程由 Carl 核准，不能改名 fixture 來湊門檻。
5. 部署前以無憑證唯讀查詢比對目前 main 與本次 SHA；舊 run、空回覆或查詢失敗會阻擋，不能靠重跑舊 run 回滾。這是當下的新舊檢查，非跨 GitHub／Cloudflare 的原子鎖；若隨後合入新版，後續序列化工作會處理新版。只有最後的 `wrangler deploy` step 接收 production secrets。缺少憑證或任何前置檢查失敗即停止。工作流程使用 production concurrency 且不取消正在部署的工作。
6. Wrangler 成功後才記錄部署 commit，公開頁驗收仍標為 pending。失敗不代表遠端已更新；不可自行重試回滾或標記已上線。

CI 的乾淨 checkout 不含本機 `drafts/`、`research/`，因此不能辨認未知私人原文。正式來源限定、先前發布關卡、乾淨重建與產物掃描共同維持資料邊界；CI 不上傳整個 workspace、私人診斷或 fixture artifact。

## 待 Carl 補齊的雲端設定

2026-10-15 唯讀盤點：既有公開 repo 的 main 沒有 branch protection／ruleset，沒有 environment、Actions secret、variable 或遠端 workflow。這是盤點時狀態；本票未修改遠端設定。本機 Wrangler 已登入不代表 CI 有專用權限。

- **GitHub main 保護：**要求透過 PR 合入、通過 PR 的 `verify` check、合入前分支保持最新；禁止 force push 與刪除，限制可更新 main 的人為 Carl，並確認管理員繞過權限不會成為日常發布方式。先讓 PR workflow 實際跑過，才能確認 required check 名稱。不得為了部署略過內容審閱。
- **GitHub production environment：**在 Settings → Environments 建立 `production`，Deployment branches and tags 使用 Selected branches and tags，只允許 branch `main`，不要開放同名 tag。正式環境不另加必需人工批准，以保留 Carl 合入後自動部署；若未來加入保護，更新本文件。
- **Cloudflare：**確認 `gravito.dev` zone 在目標 account 且可管理，確認 `carltravel.gravito.dev` 沒有其他服務／衝突記錄，確認既有 `carltravel` Worker 不會被覆蓋其他用途。由 Carl 決定目標 account；不要以本機登入帳號推斷。`wrangler.jsonc` 已包含 Static Assets、custom domain，停用 workers.dev 與 preview URLs。正式部署才會套用綁定。
- **專用 CI token：**由 Carl 在 Cloudflare 建立僅限目標 account／zone 的 API token，依官方 Workers CI 指南配置 Workers Scripts Edit 與 custom-domain 所需的 zone 權限；避免全帳戶 Global API Key。將 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 存入 GitHub **production environment secrets**。不貼到對話、程式、shell 命令列或日誌；不要把 Wrangler 本機 OAuth token 複製進 GitHub。
- **首次上線：**待第 09 票有 Carl 核准的真實景點，經 PR 與 Carl 合入，觀察主分支 workflow。不要為了測試部署加入假景點。設定未齊時維持阻擋，不宣稱已上線。

Cloudflare 設定依據：[Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)、[Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)、[GitHub Actions CI](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)。GitHub 設定依據：[Deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments)。

## 本機驗證

- `pnpm verify`：開發／PR 的完整關卡，容許零正式景點；最後仍執行 Wrangler dry-run。
- `pnpm prepare:deployment`：重新建置正式輸出並驗證部署資格；目前零正式景點應失敗，且不執行正式部署。
- `node --experimental-strip-types --test tests/deployment.test.ts`：隔離暫存 workspace 的正反案例，包括非空產物 dry-run；不會寫正式內容或呼叫真正部署。

部署 gate 的 CLI 只輸出通用錯誤，避免內容驗證錯誤攜帶私人文字進入 CI。需要本機診斷時依既有 `check:output`／`check:index` 流程查看，私人錯誤報告不可上傳。

## 公開頁驗收與故障處理

在 Actions 記錄 run URL、部署 commit 與成功結果；再以公開網域驗證 HTTPS、首頁、關於、至少一個正式景點與未知路徑 404、Pagefind 搜尋／篩選、手機與鍵盤操作，確認沒有展示 banner、fixture、草稿路徑。將實際結果補入驗收紀錄後才標記已上線。

- verify 失敗：在原 PR 或修正 PR 修復原因，重跑受影響檢查；不跳過關卡。
- 空內容／fixture／隔離檢查失敗：修正正式來源或輸出問題。零內容時是預期阻擋，不能關閉門檻。
- token、account、zone 或 hostname 失敗：Carl 確認權限與既有服務，僅修改必要設定；不要在日誌印出 token。未確認遠端結果前維持「部署失敗／待確認」。
- 部署成功但公開頁不符：保留 run／commit 與不含私密內容的觀察，先確認目前遠端版本；不要直接執行 Wrangler rollback。
- 合入後內容回復：建立新的修正／回復 PR，重新檢查，由 Carl 合入，再走相同自動部署。Agent 不推 main、不合入、不正式部署或回滾。取消本功能可另開 PR 移除 workflow／路由設定；遠端 Worker 或網域清理需另行授權，不會隨本機刪檔自動消失。
