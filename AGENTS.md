# CarlTravel 內容工作

## 代理權限

- 草稿與研究紀錄留在本機 `drafts/`、`research/`，遵循 [資料邊界](docs/architecture.md)。公開 skill、文件、測試只收規則與虛構案例。
- 研究到送審依下方入口執行，保留 Carl 的拆分勾選與內容審閱；研究授權不包含修改正式內容或開發布 PR。
- Carl 明確核准指定內容後，依發布入口重新執行本機關卡；公開 PR 只含核准內容與可公開檢查摘要。內容審閱、ready PR、Carl 合入與實際上線是不同階段。
- Agent 不推送 main、不合入 PR、不執行正式部署或正式回滾。Carl 合入、部署成功及公開頁驗證是不同階段，不互相代替。

## 內容製作入口

- 收到旅遊來源、建立草稿、補充景點或接續研究時，讀取 [.claude/skills/carltravel-research/SKILL.md](.claude/skills/carltravel-research/SKILL.md)，依 CONTEXT.md 名詞與兩次停下的節點操作。
- 本機工具用法見 [docs/research.md](docs/research.md)；草稿預覽與回復見 [docs/development.md](docs/development.md)。

- 準備發布、修改發布 PR、CI 通過轉 ready 或已合入後再修改時，讀取 [.claude/skills/carltravel-publish/SKILL.md](.claude/skills/carltravel-publish/SKILL.md)；本機命令與恢復見 [docs/publishing.md](docs/publishing.md)。
