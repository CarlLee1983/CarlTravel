# 本機發布與 PR

入口為 [carltravel-publish skill](../.claude/skills/carltravel-publish/SKILL.md)。本流程從 Carl 已審閱通過的指定草稿開始；不執行研究、不替 Carl 核准，也不合入或部署。CLI 是可驗證的操作關卡，真人授權仍由操作代理核對對話。

## 批次與核准

`pnpm publish:content --help` 列出命令。批次 id 為小寫英數與連字號，對應 `publish/<batch>` 工作分支。`snapshot <batch> <id>...` 只建立待核准紀錄，不改草稿；YAML 版本雜湊綁定選填插畫的 PNG 摘要。所有下列資料位於被 Git 忽略的 `research/publish/<batch>/`：

- `approval.md`：固定標題的指定草稿及 SHA256、正式基準及 SHA256、Carl 核准日期、Carl 決定。日期採 YYYY-MM-DD；決定第一行為「核准」，後續記真實對話依據。沒有決定時保留「未核准」。
- `approval-<hash>.md`：`revise` 保存的舊核准紀錄；不覆寫。
- `versions.md`：已通過本機關卡的核准公開內容 hash 與核准紀錄 hash，供逐提交歷史檢查；不可手動補白名單。
- `pr-body.md`：固定的可公開候選摘要；僅由 CLI 組合景點 id、逐來源／純官方景點狀態與流程說明，不複製核准決定或命中診斷。純官方資料列「未執行：純官方資料無旅遊原文」，不寫成原文比對通過。
- 失敗報告留在 `research/publish-error.md`、`research/overlap-report.md` 或批次的 `build-error.txt`。CLI 對外只印通用阻擋訊息與本機位置，避免 parser／子程序錯誤把私人資料印到公開日誌。

紀錄是單人本機證據，不是密碼學簽章或不可竄改稽核。hash 保障 YAML 及成對 PNG 的版本對應，不能證明說話者是 Carl。記錄前須先核對真實決定，不能把模板或測試中的假決策當作授權。正式內容若已不同於審閱時基準也會阻擋，避免覆蓋其他已發布修訂。草稿 YAML 或插畫任何位元組改變都要 `revise`、重新預覽及核准；同批次維持相同景點清單。

## 準備與送出

先保留既有工作，確認 `git status` 乾淨及 `gh auth status` 可用。遠端固定 `CarlLee1983/CarlTravel`，fetch 與 push URL 必須相同且指向該 repo。首次發布：

```sh
git fetch origin main
git switch -c publish/<batch> origin/main
pnpm publish:content check <batch>
pnpm publish:content prepare <batch>
git diff -- content/spots/
git add content/spots/<approved-id>/spot.yaml
# 有插畫時，同批次加入 content/spots/<approved-id>/illustration.png
git commit -m 'content: publish approved spots'
pnpm verify
pnpm publish:content submit <batch>
```

多景點時列出每個確定核准的 YAML 與成對 PNG 路徑；移除插畫時也明確 stage 刪除，不用 `git add .`。prepare 重跑本機關卡後才寫正式 YAML 並複製已驗證 PNG，或移除已失效的舊 PNG；移除草稿註解，保留草稿及原文。工具拒絕髒工作目錄、錯誤分支／遠端、非最新 main 的分支、未核准版本、非線性歷史與混入其他檔案的提交。每個歷史版本都須有曾通過本批次關卡的標準公開 YAML 及相符的成對 PNG，避免先提交私人資料再刪掉仍隨歷史推送。Git commit 訊息也會比對私人備註與原文；只寫公開描述，代理仍須人工檢視。

若在另一個 worktree 操作，先從最新 origin/main 建立工作分支，將選定批次與需要的草稿／研究紀錄複製到該 worktree 的同名忽略目錄並確認 `git check-ignore`；不使用 symlink，不搬到 content、public 或其他追蹤位置。保留原工作區資料，不把真實資料當 fixture。

`submit` 使用已驗證的固定 commit OID，僅向 `publish/<batch>` 推送，使用 `gh pr create --draft`；重試前先查既有 PR，既有 draft 則更新公開摘要。推送或 gh 失敗後不自動回滾遠端操作。先查看實際分支、PR 及 head；若要關閉／刪除遠端資料，另外取得授權。

## PR 修改與 ready

修改前用 `gh pr ready --undo <number> --repo CarlLee1983/CarlTravel` 轉回 draft；改草稿後 `revise <batch> <相同 id...>`，重新取得版本核准。再執行 check、prepare、提交、verify、submit。這會追加內容提交，保留舊核准證據；沒有重寫遠端歷史。

`ready <batch>` 重跑本機關卡及歷史檢查，要求遠端同 repo 的 open draft PR、main 目標、相同 head、相同固定公開摘要；`PR verification` 的 `verify` 必須存在，全部 check 的 bucket 都必須為 pass。pending／skip／cancel／失敗／沒有檢查均阻擋。操作後回讀 ready 與 head。GitHub API 不提供此流程的跨請求交易；檢查期間外部若改動 PR，工具會阻擋或回報未能確認，必須重新檢查。

已關閉／合入的批次不能重用分支。從最新 main 另開新批次與 PR；不把已合入後的新內容推回舊 PR。main 前進導致本分支不含最新 main 時，保留現有工作，由代理檢視差異後從新基準建立適當分支；工具不自動 merge、rebase 或 force push。

## 驗證與限制

共用 `pnpm verify` 現在也執行 `check:index` 與 `check:worker`。前者透過 Chromium 載入實際 Pagefind、列出文件並查詢正式名稱及草稿專有文字，同時檢查頁面與 sitemap；後者執行 Wrangler dry-run。第一次使用先安裝 `pnpm exec playwright install chromium`。

本機 gate 會掃描全部本機旅遊來源與純官方資料紀錄中的私人備註，核對完整原文未出現在公開候選、產物與 PR 摘要；原文的 12 字非引文比對及私人備註的含引文比對沿用研究關卡。純官方資料備註對本次全部草稿檢查；原有旅遊原文也對無 sources 的草稿檢查，曾擷取而遺失的原文仍阻擋。正式建置在草稿仍存在時執行，新的 id 排除，同 id 的原正式頁保留且修訂專有文字排除。工具可阻擋已知文字外洩，無法識別被任意改寫的私人資訊；人工 diff 審閱仍必要。

CI 的 [PR verification](../.github/workflows/pr.yml) 使用唯讀權限、固定 action commit、Node 24、lockfile 及 Chromium，直接執行同一 `pnpm verify`，不取得私人研究或 Cloudflare 密鑰、不部署、不上傳本機報告。Wrangler 固定版本與 workerd 安裝腳本用於真實 dry-run；[最小 assets 設定](../wrangler.jsonc)只指定 dist 與 404，正式帳號、網域、部署工作流程留第 08 票。行為依 [Cloudflare dry-run 文件](https://developers.cloudflare.com/workers/wrangler/commands/workers/)及 [GitHub CLI checks 文件](https://cli.github.com/manual/gh_pr_checks)。

撤回實作不需資料遷移：移除發布 CLI／skill／CI 入口，保留忽略目錄與私人紀錄。準備內容後若不送出，先保存 diff，再由使用者決定如何處理本機正式檔；工具不自行 reset。合入後的內容回復須新 PR、Carl 合入與後續部署。第 07 票只用隔離虛構資料與模擬 GitHub 驗收，沒有建立真實發布 PR。
