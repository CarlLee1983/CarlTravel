# 資料與操作邊界

正式資料是 `content/spots/<id>/spot.yaml`；本機草稿是 `drafts/spots/<id>/spot.yaml`。兩者可選擇同層的 `illustration.png`，由 YAML 雜湊與尺寸綁定。內容使用 `src/content/schema.ts` 與 `loadSpots`，由位置識別草稿，沒有持久化的 draft 欄位。頁面才使用 `loadPageSpots` 在一般開發時覆蓋同 id；插畫路由也選同一個草稿或正式根目錄。Astro 的實際 dev 指令啟用預覽，獨立正式建置不讀草稿。快取更新與驗證見[開發文件](development.md)。

公開頁面渲染已驗證內容。sitemap、Pagefind 與列表 JSON（`/spot-list/<雜湊>.json`）持續只使用單一正式／fixture 根目錄；研究工具不呼叫公開建置，也不把私人資料複製到 src、content 或 public。公開資產、直接檔案請求與格式化工具的私人路徑保護沿用第 05 票。完整私人 sitemap／Pagefind 外洩檢查已由第 07 票整合。

旅遊來源的 `research/<來源 id>/` 保存原文、Carl 備註、讀取證據、拆分與勾選、官方查詢及送審清單；純官方資料的 `research/official/<景點 id>/` 保存備註、勾選、官方查詢及送審清單，不建立旅遊原文。這些資料只由本機研究／發布關卡讀取，不進 Git、公開資產或 CI artifact。`source.md` 的固定標題與讀取歷程是不可讀例外的依據；沒有額外 JSON/YAML 研究 schema。旅遊來源 id 同時保留於公開 sources 參照；純官方資料的 sources 與 authorNotes 為空，官方事實使用 officialRefs。

`.claude/skills/carltravel-research/` 擁有讀取、查證、草稿與送審流程；`scripts/research.ts` 提供紀錄、比對與檢查入口。重疊模組 `scripts/research/check.ts` 接收指定草稿 id，回傳不含命中文字的逐來源與純官方景點狀態，詳細診斷寫在本機 `research/overlap-report.md`。發布階段重用此入口並重新執行，不複製另一套比對邏輯。規則、限制及回復方式見[本機研究工具](research.md)。

schema 驗證資料結構、行政區與參照；研究關卡驗證旅遊來源與純官方景點的私人證據及重疊；人工審閱判斷來源品質、同一性待確認、寫作品質及內容取捨。Markdown 的核准摘要是本機可稽核紀錄，不是數位簽章；工具不能驗證真實對話，也不防範有人蓄意刪改全部本機證據。Agent 只能記錄 Carl 已明確表達的決定。

目前驗證入口為 `pnpm verify`（公開程式／虛構 fixture）與 `pnpm research check <id>…`（指定本機草稿與研究紀錄）。測試以一次性 app 生成虛構私人資料，不讀取使用者的研究檔案。發布 skill 與 PR CI 已交付，正式部署仍由第 08 票完成；PR 合入不等於成功上線，部署成功並確認公開頁才完成上線驗收。

第 07 票新增 `scripts/publish/`：batch 邊界保存核准版本並重用研究關卡，isolation 邊界檢查正式頁面／sitemap／實際 Pagefind，remote 邊界依序檢查 Git 候選與操作 gh。候選寫標準 YAML 與其宣告的成對 PNG；公開摘要使用固定模板。批次核准、曾驗證內容版本與診斷同樣留本機 Markdown，沒有新研究 schema。GitHub 操作測試以隔離 Git 歷史和模擬程序邊界驗證；正式 CLI 固定指定 repo 與工作分支。PR CI 呼叫共用 verify（含真實 Wrangler dry-run），不讀私人來源，不部署。詳細限制及回復見 [發布操作](publishing.md)。
