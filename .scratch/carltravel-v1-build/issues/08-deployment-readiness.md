# 08: 自動部署設定與上線關卡

**What to build:** 維護者完成既有repo的自動部署與網域準備，只有通過檢查的正式內容才能進入上線流程。

**Blocked by:** [07：審閱通過到發布 PR](07-review-to-publish-pr.md)

**Status:** ready-for-agent

**Parent:** [CarlTravel v1 規格](../../carltravel-v1/issues/11-carltravel-v1-spec.md)

- [ ] 依實作階段授權設定既有CarlLee1983/CarlTravel、Cloudflare Workers Static Assets及carltravel.gravito.dev；不另建repo，不將憑證放入程式或日誌。
- [ ] 部署流程沿用PR共用verify，通過後以正式內容重建，再檢查產物才可部署；明確區分fixture驗證輸出與真正部署輸出。
- [ ] 零正式景點時開發／CI可通過，但正式部署必須被阻擋；測試或原型資料不能用來湊上線門檻。
- [ ] 可在沒有真實景點前用dry-run與失敗案例完成本票；不以先正式部署作為完成前提，避免與下一票形成循環依賴。
- [ ] 只有既定授權與主分支流程可觸發正式部署，Agent不直接執行正式部署或回滾；部署失敗不可記為已上線。
- [ ] 確認公開artifact不含私人資料或fixture，驗證空內容與不合規產物擋下的行為，準備部署結果與公開頁驗收方式。
- [ ] 完成設定、必要人工操作、CI失敗處理與回復文件；合入後內容回復經新PR、Carl合入及自動部署。
