# CarlTravel

個人與親子旅遊知識網站，以台灣景點為核心。Agent 依 Carl 提供的旅遊文章研究查證，寫成草稿，經 Carl 審閱後才公開。官方資訊逐條附上官方出處與查證日期，原作者心得與 Agent 建議分開呈現。

## 目前狀態

已完成第 01–06 票：完整景點閱讀、資訊狀態與來源顯名、D 組合版面、章節目錄、關於頁、404、授權宣告與 sitemap 白名單。已加入 Pagefind 搜尋與縣市、類型、環境、年齡帶四種篩選。本機開發可預覽新草稿及同 id 修訂，並提供複製與差異指令；正式建置仍只讀正式內容。已交付來源研究 skill、本機紀錄／同一性工具與可重用重疊關卡，送審仍保留 Carl 的人工決定。正式景點目前為零，尚未部署。完整範圍見 [v1 規格](.scratch/carltravel-v1/issues/11-carltravel-v1-spec.md) 與 [工作票索引](.scratch/carltravel-v1-build/README.md)。

啟動：`pnpm install --frozen-lockfile`，完整搜尋預覽用 `pnpm build:fixture && pnpm preview:fixture`；頁面即時開發用 `pnpm dev:fixture`（不產生搜尋索引）。私人草稿預覽用 `pnpm dev`，操作見[草稿與修訂預覽](docs/development.md#第-05-票本機草稿與修訂預覽)。驗證：首次先 `pnpm exec playwright install chromium`，再 `pnpm verify`。詳見[本機開發與資料邊界](docs/development.md)。

## 文件

- [CONTEXT.md](CONTEXT.md)：專案用語，例如景點、來源、官方出處、草稿、發布。
- [來源研究與送審](.claude/skills/carltravel-research/SKILL.md)：內容製作入口；[本機工具](docs/research.md) 提供紀錄與重疊檢查。
- [資料與操作邊界](docs/architecture.md)、[驗收狀態](docs/acceptance.md)。
- [公開介面與無障礙驗證](docs/public-interface.md)：路由、版面、授權入口、sitemap 與測試範圍。
- [docs/adr/](docs/adr/)：架構決策紀錄。
- [.scratch/carltravel-v1/](.scratch/carltravel-v1/)：v1 規劃地圖、決策票、原型與研究摘要。

## 不公開的內容

草稿（`drafts/`）與研究紀錄（`research/`）只存在本機，不進 Git，理由見 [ADR-0001](docs/adr/0001-drafts-and-research-stay-local.md)。

## 授權範圍

程式碼、schema、skills 與相關軟體文件採 [MIT](LICENSE)。本站撰寫的公開景點內容採 [CC BY-NC 4.0](content/LICENSE.md)，MIT 不適用於景點內容；原作者引文、官方事實與政府開放資料另依該宣告所列範圍處理，不由本站重新授權。網站的完整說明在 `/about/#license`。
