# CarlTravel v1 實作工作票

依已核准的九票拆分建立；未完成的工作票維持 `ready-for-agent`，但只有所有前置票完成者才可開始。母規格與決策地圖保持原狀。第 01–04 票已完成本機實作與驗證；下一張依序為第 05 票，已解除前置相依，其餘仍依依賴關係推進。

母規格：[CarlTravel v1：景點知識網站與審閱發布流程](../carltravel-v1/issues/11-carltravel-v1-spec.md)。

| 工作票 | 前置工作票 |
| --- | --- |
| [第一個景點可瀏覽](issues/01-first-browsable-spot.md) | 無，可開始 |
| [完整景點內容與資訊狀態](issues/02-complete-spot-reading.md) | 第一個景點可瀏覽 |
| [網站視覺、授權與基本頁面](issues/03-site-design-and-license.md) | 完整景點內容與資訊狀態 |
| [搜尋與四種篩選](issues/04-search-and-filters.md) | 網站視覺、授權與基本頁面 |
| [本機草稿與修訂預覽](issues/05-draft-preview-isolation.md) | 完整景點內容與資訊狀態 |
| [來源研究到送審](issues/06-research-to-review.md) | 本機草稿與修訂預覽 |
| [審閱通過到發布 PR](issues/07-review-to-publish-pr.md) | 搜尋與四種篩選、來源研究到送審 |
| [自動部署設定與上線關卡](issues/08-deployment-readiness.md) | 審閱通過到發布 PR |
| [真實來源完整上線驗收](issues/09-real-source-launch-acceptance.md) | 自動部署設定與上線關卡 |

每張票隨功能交付測試與相關文件；遵循母規格與既有 ADR，不另創來源／草稿規則。正式部署設定可在零景點時以 dry-run 完成，真實來源與 Carl 合入是最後一票的人工依賴。外部寫入依實作階段授權執行，工作票不授權 Agent 合入或正式部署。
