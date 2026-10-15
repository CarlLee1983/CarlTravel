# CarlTravel

個人與親子旅遊知識網站，以台灣景點為核心。Agent 依 Carl 提供的旅遊文章研究查證，寫成草稿，經 Carl 審閱後才公開。官方資訊逐條附上官方出處與查證日期，原作者心得與 Agent 建議分開呈現。

## 目前狀態

已完成第 01–03 票：完整景點閱讀、資訊狀態與來源顯名、D 組合版面、章節目錄、關於頁、404、授權宣告與 sitemap 白名單。搜尋與篩選尚未開放，由第 04 票交付。正式景點目前為零，尚未部署。完整範圍見 [v1 規格](.scratch/carltravel-v1/issues/11-carltravel-v1-spec.md) 與 [工作票索引](.scratch/carltravel-v1-build/README.md)。

啟動：`pnpm install --frozen-lockfile`、`pnpm dev:fixture`。驗證：首次先 `pnpm exec playwright install chromium`，再 `pnpm verify`。詳見[本機開發與資料邊界](docs/development.md)。

## 文件

- [CONTEXT.md](CONTEXT.md)：專案用語，例如景點、來源、官方出處、草稿、發布。
- [公開介面與無障礙驗證](docs/public-interface.md)：路由、版面、授權入口、sitemap 與測試範圍。
- [docs/adr/](docs/adr/)：架構決策紀錄。
- [.scratch/carltravel-v1/](.scratch/carltravel-v1/)：v1 規劃地圖、決策票、原型與研究摘要。

## 不公開的內容

草稿（`drafts/`）與研究紀錄（`research/`）只存在本機，不進 Git，理由見 [ADR-0001](docs/adr/0001-drafts-and-research-stay-local.md)。

## 授權範圍

程式碼、schema、skills 與相關軟體文件採 [MIT](LICENSE)。本站撰寫的公開景點內容採 [CC BY-NC 4.0](content/LICENSE.md)，MIT 不適用於景點內容；原作者引文、官方事實與政府開放資料另依該宣告所列範圍處理，不由本站重新授權。網站的完整說明在 `/about/#license`。
