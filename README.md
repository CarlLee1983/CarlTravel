# CarlTravel

個人與親子旅遊知識網站，以台灣景點為核心。Agent 依 Carl 提供的旅遊文章研究查證，寫成草稿，經 Carl 審閱後才公開。官方資訊逐條附上官方出處與查證日期，原作者心得與 Agent 建議分開呈現。

## 目前狀態

已完成第 01 票基底與第 02 票「完整景點內容與資訊狀態」：完整景點閱讀、三種資訊標示、來源與顯名、過期提示及內容關卡。正式景點目前為零，尚未部署。完整範圍見 [v1 規格](.scratch/carltravel-v1/issues/11-carltravel-v1-spec.md) 與 [工作票索引](.scratch/carltravel-v1-build/README.md)。

啟動：`pnpm install --frozen-lockfile`、`pnpm dev:fixture`。驗證：首次先 `pnpm exec playwright install chromium`，再 `pnpm verify`。詳見[本機開發與資料邊界](docs/development.md)。

## 文件

- [CONTEXT.md](CONTEXT.md)：專案用語，例如景點、來源、官方出處、草稿、發布。
- [docs/adr/](docs/adr/)：架構決策紀錄。
- [.scratch/carltravel-v1/](.scratch/carltravel-v1/)：v1 規劃地圖、決策票、原型與研究摘要。

## 不公開的內容

草稿（`drafts/`）與研究紀錄（`research/`）只存在本機，不進 Git，理由見 [ADR-0001](docs/adr/0001-drafts-and-research-stay-local.md)。
