# 08: 自動部署設定與上線關卡

**What to build:** 維護者完成既有repo的自動部署與網域準備，只有通過檢查的正式內容才能進入上線流程。

**Blocked by:** [07：審閱通過到發布 PR](07-review-to-publish-pr.md)

**Status:** implemented-local; cloud-setup-pending

**Parent:** [CarlTravel v1 規格](../../carltravel-v1/issues/11-carltravel-v1-spec.md)

- [ ] 依實作階段授權設定既有CarlLee1983/CarlTravel、Cloudflare Workers Static Assets及carltravel.gravito.dev；不另建repo，不將憑證放入程式或日誌。
- [x] 部署流程沿用PR共用verify，通過後以正式內容重建，再檢查產物才可部署；明確區分fixture驗證輸出與真正部署輸出。
- [x] 零正式景點時開發／CI可通過，但正式部署必須被阻擋；測試或原型資料不能用來湊上線門檻。
- [x] 可在沒有真實景點前用dry-run與失敗案例完成本票；不以先正式部署作為完成前提，避免與下一票形成循環依賴。
- [x] 只有既定授權與主分支流程可觸發正式部署，Agent不直接執行正式部署或回滾；部署失敗不可記為已上線。
- [x] 確認公開artifact不含私人資料或fixture，驗證空內容與不合規產物擋下的行為，準備部署結果與公開頁驗收方式。
- [x] 完成設定、必要人工操作、CI失敗處理與回復文件；合入後內容回復經新PR、Carl合入及自動部署。

## 實作紀錄

- Carl 選擇「先完成實作與 dry-run，列出待補設定」。第一項的本機 Wrangler／workflow 設定已備妥；遠端 main 保護、production environment、CI token 與 account／zone／hostname 確認仍待人工設定，不勾選為已完成。
- `.github/workflows/deploy.yml` 限定 main，部署另限既有 repo 與 Carl；無憑證 verify 後，獨立 runner 從相同 commit 重建正式產物。
- `pnpm prepare:deployment` 先 build，再正式內容／Pagefind／隔離 gate，再 Wrangler dry-run；真正 deploy 只存在最後的 CI credential step。
- `tests/deployment.test.ts` 使用隔離虛構資料驗證非空 dry-run、空內容、fixture 與私人目錄阻擋；不寫入正式內容。
- 設定、人工操作、公開頁驗收與故障回復見 [部署文件](../../../docs/deployment.md)。沒有正式部署，不宣稱上線；第 09 票仍需真實內容與公開驗收。
- 驗證：完整 `E2E_PORT=4337 pnpm verify` 通過（61 個 Node 測試、43 個瀏覽器測試、格式／型別／正式輸出／Pagefind／Wrangler dry-run）。審查後補上重跑者與目前 main 的限制，再通過 3 個部署測試、型別與格式檢查；目前總計 62 個 Node 案例。
- 直接執行 `pnpm prepare:deployment` 在零正式景點時如預期以 exit 1 停止，未呼叫正式部署。非空 dry-run 只在隔離測試 workspace 執行。
- 雙軸審查修正一項舊 workflow 重跑可回退內容的問題：部署前比對原始／重跑觸發者及目前 main SHA，查詢失敗亦阻擋。
