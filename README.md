# CarlTravel

個人與親子旅遊知識網站，以台灣景點為核心。Agent 依 Carl 提供的旅遊文章研究查證，寫成草稿，經 Carl 審閱後才公開。官方資訊逐條附上官方出處與查證日期，原作者心得與 Agent 建議分開呈現。

## 目前狀態

規劃階段，尚未建站。v1 的實作前決策記錄在 [規格決策地圖](.scratch/carltravel-v1/map.md)，完成後會產出一份 v1 規格，再依規格實作。技術基線預計沿用 CarlKitchen（Astro、Cloudflare）。

## 文件

- [CONTEXT.md](CONTEXT.md)：專案用語，例如景點、來源、官方出處、草稿、發布。
- [docs/adr/](docs/adr/)：架構決策紀錄。
- [.scratch/carltravel-v1/](.scratch/carltravel-v1/)：v1 規劃地圖、決策票、原型與研究摘要。

## 不公開的內容

草稿（`drafts/`）與研究紀錄（`research/`）只存在本機，不進 Git，理由見 [ADR-0001](docs/adr/0001-drafts-and-research-stay-local.md)。
