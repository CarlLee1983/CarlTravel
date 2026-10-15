# 本機開發與驗證

需要 Node.js 24 或以上、pnpm 12。首次執行：

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm dev:fixture
```

開啟終端列出的本機網址。首頁可進入最小案例 `/spots/example-park/` 與完整案例 `/spots/example-museum/`；頁首明示這是虛構展示。地址、出處網址、日期與敘述只用來測試，不是真實景點查證紀錄。

## 指令

| 指令                                          | 用途                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                                    | 只讀正式內容的開發站；目前可為零景點                                     |
| `pnpm dev:fixture`                            | 展示測試景點                                                             |
| `pnpm build` / `pnpm preview`                 | 正式靜態建置到 `dist/`／檢視正式建置                                     |
| `pnpm build:fixture` / `pnpm preview:fixture` | 測試靜態建置到 `dist-fixture/`／檢視測試建置                             |
| `pnpm format` / `pnpm format:check`           | 格式化／檢查應用程式與測試；不改既有規劃文件                             |
| `pnpm check`                                  | Astro 與 TypeScript 檢查                                                 |
| `pnpm check:content`                          | 載入並驗證正式 YAML                                                      |
| `pnpm test`                                   | Node 內容載入接受／拒絕測試                                              |
| `pnpm test:e2e`                               | 建置 fixture，以 Playwright 測導航、出處、日期、鍵盤、axe 與五種螢幕寬度 |
| `pnpm verify`                                 | 共用整合關卡；最後重建並檢查正式輸出                                     |

## 內容載入責任

`src/content/schema.ts` 定義完整景點欄位與參照、引文、文字規則。未知欄位拒絕載入，不能把私人備註夾進公開資料。第 02 票新增選填設施、跟孩子一起看、作者心得、Agent 建議、周邊安排與開放資料顯名，既有最小資料不需換格式。詳見[資料模型與公開檢查](content-model.md)。

`src/content/load.ts` 是頁面、內容檢查與測試共用的 YAML 載入入口。每個景點為 `<root>/<id>/spot.yaml`，id 只從資料夾取得。它驗證行政區、日期、參照、重複及未使用出處；拒絕錯誤時列出檔案與欄位。空目錄有效，遺失目錄會失敗。行政區採用有出處紀錄的[官方快照](../src/data/README.md)，建置不需連線。來源可為空陣列，讓只有官方資訊的案例合法；研究來源與 Carl 核准證據由後續本機發布關卡處理。

## 正式與 fixture 邊界

`src/content/mode.ts` 統一選擇根目錄及輸出位置：正式讀 `content/spots/`、輸出 `dist/`；fixture 讀 `tests/fixtures/spots/`、輸出 `dist-fixture/`。兩者共用 schema、載入與頁面，沒有複製內容到正式目錄的步驟。

`pnpm` 公開指令經 `scripts/site.mjs` 清除繼承的 fixture 環境變數；只有明確的 fixture 指令才啟用它。因此 `CARLTRAVEL_FIXTURE=1 pnpm build` 仍建置正式內容。直接呼叫 Astro 是內部開發入口，不能替代正式建置指令。fixture 頁面有醒目標示與 noindex。測試 server 不重用其他行程；不要把 `dist-fixture/` 當部署輸入。

本票尚不讀取 `drafts/` 或 `research/`；兩者持續由 Git 排除。草稿優先載入與修訂預覽在第 05 票實作。搜尋、授權頁、CI 與部署關卡依後續票加入同一條 verify；目前不宣稱可上線，不執行部署。

回復這個切片時可移除新增的應用程式與測試，不需要變更正式內容、規劃文件或既有 Git 歷史。

## 依賴與驗收範圍

Astro 提供靜態頁面與型別檢查；`yaml` 解析單檔內容，`zod` 共用執行期驗證及 TypeScript 型別；Prettier 與 Astro plugin 維持格式；Playwright 與 axe 驗證實際瀏覽行為及可及性。版本與 lockfile 固定；pnpm 僅允許 esbuild 執行必要的安裝建置。沒有加入資料庫或伺服器端服務。

第 01 票驗收：18 個 Node 測試、14 個瀏覽器測試、完整 `pnpm verify` 及獨立審查通過。建置輸出檢查要求首頁與所有正式景點頁存在，並拒絕 fixture 標記。這是第一個可瀏覽切片的證據，不代表全部 v1 功能或正式上線驗收完成。

第 02 票驗收：32 個 Node 測試、21 個瀏覽器測試，修正後完整 `pnpm verify` 通過。標準與規格雙軸審查的發現均已處理並複查；正式內容仍為零，完整景點只在獨立 fixture 展示。
