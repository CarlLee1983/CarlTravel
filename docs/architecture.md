# 資料與操作邊界

正式資料是 `content/spots/<id>/spot.yaml`；本機草稿是 `drafts/spots/<id>/spot.yaml`。兩者使用 `src/content/schema.ts` 與 `loadSpots`，由位置識別草稿，沒有持久化的 draft 欄位。頁面才使用 `loadPageSpots` 在一般開發時覆蓋同 id；Astro 的實際 dev 指令啟用預覽，獨立正式建置不讀草稿。快取更新與驗證見[開發文件](development.md)。

公開頁面渲染已驗證內容。sitemap 與 Pagefind 持續使用單一正式／fixture 根目錄；研究工具不呼叫公開建置，也不把私人資料複製到 src、content 或 public。公開資產、直接檔案請求與格式化工具的私人路徑保護沿用第 05 票。完整私人 sitemap／Pagefind 外洩檢查在第 07 票整合。

`research/<來源 id>/` 保存原文、Carl 備註、讀取證據、拆分與勾選、官方查詢及送審清單。這些資料只由本機研究／發布關卡讀取，不進 Git、公開資產或 CI artifact。`source.md` 的固定標題與讀取歷程是不可讀例外的依據；沒有額外 JSON/YAML 研究 schema。來源 id 同時保留於公開 sources 參照，確保關卡能找到每個來源的本機證據。

`.claude/skills/carltravel-research/` 擁有讀取、查證、草稿與送審流程；`scripts/research.ts` 提供紀錄、比對與檢查入口。重疊模組 `scripts/research/check.ts` 接收指定草稿 id，回傳不含命中文字的逐來源狀態，詳細診斷寫在本機 `research/overlap-report.md`。發布階段重用此入口並重新執行，不複製另一套比對邏輯。規則、限制及回復方式見[本機研究工具](research.md)。

schema 驗證資料結構、行政區與參照；研究關卡驗證私人證據及重疊；人工審閱判斷來源品質、同一性待確認、寫作品質及內容取捨。Markdown 的核准摘要是本機可稽核紀錄，不是數位簽章；工具不能驗證真實對話，也不防範有人蓄意刪改全部本機證據。Agent 只能記錄 Carl 已明確表達的決定。

目前驗證入口為 `pnpm verify`（公開程式／虛構 fixture）與 `pnpm research check <id>…`（指定本機草稿與研究紀錄）。測試以一次性 app 生成虛構私人資料，不讀取使用者的研究檔案。後續發布 skill、CI、部署仍分票交付；PR 合入不等於成功上線，部署成功並確認公開頁才完成上線驗收。
