---
name: carltravel-publish
description: 將 Carl 明確審閱通過的旅遊來源或純官方資料草稿準備為發布 draft PR；處理修改、CI 通過轉 ready 與後續批次。
---

# 審閱通過到發布 PR

依 [發布操作](../../../docs/publishing.md)執行。一次 Carl 審閱通過的指定景點形成一個批次、一條 `publish/<batch>` 分支、一個 PR。所有私人證據與詳細診斷留在 `research/`；公開 PR 只收核准內容及工具生成的公開摘要。

## 1. 核對決定與版本

讀取 Carl 的實際對話決定、指定草稿與旅遊來源或純官方資料的送審紀錄。純官方資料須核對 `research/official/<id>/record.md` 的真實勾選、已填官方查詢與八項送審清單。確認每份草稿已實際預覽，既有景點有差異，送審清單八項齊備；逐一核對不可讀來源的 Carl 例外決定。只有「繼續研究」「可以送審」或未明指內容的回覆，不是發布流程的內容核准。

在內容不變的狀態執行 `pnpm publish:content snapshot <batch> <id>...`，把真實核准日期與對話摘要記入工具產生的 `approval.md`。`Carl 決定` 第一行為「核准」，後續為可回查的對話依據。工具不會替 Carl 核准，也無法驗證說話者。核准後的任何 YAML 修改（含註解）或插畫 PNG 修改都使原版本失效。

**完成條件：** 指定內容、真實核准證據及工具計算的版本一致；有缺口即停下，請 Carl 補充對該版本的決定，不代答。

## 2. 本機關卡與工作分支

確認工作目錄乾淨、遠端是指定的 CarlTravel repo。讀取既有 PR 狀態；已合入／關閉的分支保留原狀，fetch 最新 main 後另開批次與分支。首次發布從最新 `origin/main` 建立 `publish/<batch>`，不把功能開發分支的提交混入內容 PR。另開 worktree 時依操作文件安全搬移本機證據，不連到公開目錄。

執行 `pnpm publish:content check <batch>`。工具重跑 schema、圖片、逐來源例外／重疊、正式建置、頁面／sitemap／實際 Pagefind 隔離及私人文字檢查。失敗時讀取本機報告，在本機對話逐條說明檔案、欄位與原因；修正後重跑。不可讀的 `not_run_approved_unreadable` 明寫「未執行：原文無法讀取」；純官方資料的 `original: not_applicable` 明寫「未執行：純官方資料無旅遊原文」，均不能改稱原文比對通過。純官方備註與留存旅遊來源原文仍須接受同一關卡檢查。

**完成條件：** 本機關卡通過；核准範圍以外的草稿與同 id 修訂仍隔離。工具不能判斷轉述是否足以取代原文、官方資料品質或真人意圖，依研究 skill 與 Carl 的內容審閱確認。

## 3. 準備公開變更與 draft PR

執行 `pnpm publish:content prepare <batch>`，將核准內容以標準 YAML 寫到指定正式檔，並複製驗證過的成對 PNG 或移除已取消的舊 PNG；不直接複製含註解的草稿。檢查 diff 與工具生成的 `pr-body.md`：只含指定公開內容、可公開摘要與逐來源／純官方景點狀態；真實原文、備註、命中片段、核准對話、送審原始紀錄及私人路徑不進 Git／PR。

只 stage 指定 `content/spots/<id>/spot.yaml` 及其成對 `illustration.png`（含刪除），以無私人資訊的訊息提交。執行共用 `pnpm verify`；全部通過後執行 `pnpm publish:content submit <batch>`。工具重跑本機關卡、檢查每一個待推送提交的標準 YAML 與成對 PNG 版本，再推工作分支及建立 draft PR。公開說明沿用工具內建的 pr 格式；不要加貼本機日誌。回讀遠端 URL、head 與 draft 狀態。

**完成條件：** 一個 draft PR 的遠端提交與核准版本一致，摘要無私人資料。若推送後 GitHub 操作失敗，保留現況並回報已完成的階段；先查現有 PR 再重試，不自動刪遠端分支。

## 4. 修改與轉 ready

PR 有修改時先轉回 draft。內容改動後執行 `revise <batch> <原有 id>...`，保存舊證據並產生新的待核准版本；重新預覽、列差異並取得 Carl 對新版本的核准。同批次的景點清單固定，範圍變更另開批次。重跑 check、prepare、提交、verify、submit，保留既有提交與審閱證據，不 force push。

確認修改完成，以 `gh pr checks` 查看完整 PR verification。所有檢查都成功後執行 `pnpm publish:content ready <batch>`；工具再次驗證本機版本、逐來源狀態、整段提交歷史、遠端 head 與完整 verify 的成功狀態，才轉 ready。沒有檢查、pending、skipped、cancelled 或失敗都保留 draft。

**完成條件：** 遠端同一個 PR 已確認 ready；告知 Carl 可審查合入。Agent 不推 main、不合入、不正式部署或回滾。Carl 合入、部署成功、公開頁驗證是後續不同階段；只有後兩者也完成才宣稱上線。
