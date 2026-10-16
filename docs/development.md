# 本機開發與驗證

需要 Node.js 24 或以上、pnpm 12。首次執行：

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm dev:fixture
```

開啟終端列出的本機網址。首頁可進入最小案例 `/spots/example-park/` 與完整案例 `/spots/example-museum/`；頁首明示這是虛構展示。地址、出處網址、日期與敘述只用來測試，不是真實景點查證紀錄。

## 指令

| 指令                                          | 用途                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                                    | 正式內容加本機草稿的開發預覽；可為零景點                                     |
| `pnpm dev:fixture`                            | 展示測試景點                                                             |
| `pnpm build` / `pnpm preview`                 | 正式靜態建置到 `dist/`／檢視正式建置                                     |
| `pnpm build:fixture` / `pnpm preview:fixture` | 測試靜態建置到 `dist-fixture/`／檢視測試建置                             |
| `pnpm format` / `pnpm format:check`           | 格式化／檢查應用程式與測試；不改既有規劃文件                             |
| `pnpm check`                                  | Astro 與 TypeScript 檢查                                                 |
| `pnpm check:content`                          | 載入並驗證正式 YAML                                                      |
| `pnpm test`                                   | Node 內容載入接受／拒絕測試                                              |
| `pnpm test:e2e`                               | 建置 fixture，以 Playwright 測導航、出處、日期、鍵盤、axe 與五種螢幕寬度；Chromium 全跑，WebKit 只跑 `@smoke` |
| `pnpm verify`                                 | 共用整合關卡；最後重建並檢查正式輸出                                     |

## 內容載入責任

`src/content/schema.ts` 定義完整景點欄位與參照、引文、文字規則。未知欄位拒絕載入，不能把私人備註夾進公開資料。第 02 票新增選填設施、跟孩子一起看、作者心得、Agent 建議、周邊安排與開放資料顯名，既有最小資料不需換格式。詳見[資料模型與公開檢查](content-model.md)。

`src/content/load.ts` 是頁面、內容檢查與測試共用的載入入口。每個景點為 `<root>/<id>/spot.yaml`，可有 YAML 宣告的同層 `illustration.png`；id 只從資料夾取得。它驗證行政區、日期、參照、重複、未使用出處及插畫檔案與雜湊；拒絕錯誤時列出檔案與欄位。空目錄有效，遺失目錄會失敗。行政區採用有出處紀錄的[官方快照](../src/data/README.md)，建置不需連線。來源可為空陣列，讓只有官方資訊的案例合法；研究來源與 Carl 核准證據由後續本機發布關卡處理。

## 正式與 fixture 邊界

`src/content/mode.ts` 統一選擇根目錄及輸出位置：正式讀 `content/spots/`、輸出 `dist/`；fixture 讀 `tests/fixtures/spots/`、輸出 `dist-fixture/`。兩者共用 schema、載入與頁面，沒有複製內容到正式目錄的步驟。

`pnpm` 公開指令經 `scripts/site.mjs` 清除繼承的 fixture 環境變數；只有明確的 fixture 指令才啟用它。因此 `CARLTRAVEL_FIXTURE=1 pnpm build` 仍建置正式內容。直接呼叫 Astro 是內部開發入口，不能替代正式建置指令。fixture 頁面有醒目標示與 noindex。測試 server 不重用其他行程；不要把 `dist-fixture/` 當部署輸入。

## 規模產生器與 e2e fixture

`scripts/scale/generate-spots.ts` 以固定種子產生虛構景點。同一組種子與筆數，每次都產生逐位元組相同的 `spot.yaml` 與插畫，且通過現有 schema 與行政區驗證。輸出只寫到暫存目錄；指定的 `--out` 若在專案目錄內會直接拒絕，所以不會進 Git，也不會碰 `content/`。

```sh
node --experimental-strip-types scripts/scale/generate-spots.ts [--seed 20261017] [--count 60] [--out <專案外的目錄>]
```

沒給 `--out` 時建立 `carltravel-spots-*` 暫存目錄，stdout 只印出該路徑。產生的 id 為 `fx-00001` 起，名稱都帶「（虛構）」。每第 20 筆是完整形態並附共用的 1536×1024 插畫，每第 7 筆是已知年齡但無插畫的公開資料頁形態，其餘年齡未標示且親子條件全為未知。前四筆固定為臺中市與高雄市各兩個行政區，所以任何筆數都涵蓋兩層縣市與行政區。

`pnpm build:fixture` 與 `pnpm dev:fixture` 由 `scripts/site.mjs` 先呼叫 `scripts/scale/fixture-root.ts`，把手寫的 `tests/fixtures/spots`（2 筆）與固定種子（`FIXTURE_SEED`）產生的 `FIXTURE_COUNT`（60）筆組成暫存內容根目錄，經 `CARLTRAVEL_FIXTURE_ROOT` 交給 `src/content/mode.ts`，結束時刪除。該變數只在 fixture 模式有效，`scripts/site.mjs` 也會清掉繼承而來的值。e2e 因此看到 62 筆景點；`e2e/fixture.ts` 的 `TOTAL_SPOTS` 要與兩者同步。

產生景點的名稱同樣納入 `pnpm check:output` 的洩漏檢查，與手寫 fixture 一視同仁。WebKit project 只執行標題含 `@smoke` 的案例（瀏覽與景點頁、文字搜尋、篩選還原與移除），其餘案例只在 Chromium 執行。

第 05 票讓一般開發預覽讀取 `drafts/spots/`；`research/` 不由網站載入，兩者持續由 Git 排除。正式及 fixture 建置、fixture 開發仍不載入草稿。CI 與部署關卡依後續票加入同一條 verify；目前不宣稱可上線，不執行部署。

回復這個切片時可移除新增的應用程式與測試，不需要變更正式內容、規劃文件或既有 Git 歷史。

## 依賴與驗收範圍

Astro 提供靜態頁面與型別檢查；`yaml` 解析單檔內容，`zod` 共用執行期驗證及 TypeScript 型別；Prettier 與 Astro plugin 維持格式；Playwright 與 axe 驗證實際瀏覽行為及可及性。版本與 lockfile 固定；pnpm 僅允許 esbuild 執行必要的安裝建置。沒有加入資料庫或伺服器端服務。

第 01 票驗收：18 個 Node 測試、14 個瀏覽器測試、完整 `pnpm verify` 及獨立審查通過。建置輸出檢查要求首頁與所有正式景點頁存在，並拒絕 fixture 標記。這是第一個可瀏覽切片的證據，不代表全部 v1 功能或正式上線驗收完成。

第 02 票驗收：32 個 Node 測試、21 個瀏覽器測試，修正後完整 `pnpm verify` 通過。標準與規格雙軸審查的發現均已處理並複查；正式內容仍為零，完整景點只在獨立 fixture 展示。

## 第 03 票：公開介面與授權

首頁採 D 組合版面，景點頁提供依內容生成的章節目錄；關於頁與 404 共用站內導覽、授權及免責入口。第 03 票先保留搜尋篩選版面，第 04 票已補上實際行為。路由、響應式布局與驗證邊界見[公開介面與無障礙驗證](public-interface.md)。

`src/site.ts` 保存母規格指定的正式 origin；Astro 設定與 sitemap／輸出檢查共用。`/sitemap.xml` 僅從正式內容載入器建立首頁、關於頁與正式景點的絕對網址，不掃描頁面目錄。fixture sitemap 為空；正式輸出關卡要求三種基本頁面（首頁、關於頁、404）存在，並比對 sitemap 的完整網址集合，拒絕缺漏、重複、錯誤網域及非正式路徑。來源集合沒有變更，也沒有新增套件或部署設定。

回復第 03 票可撤回本票的頁面、樣式、授權檔及輸出檢查變更，不需遷移內容資料。此操作不會撤銷已依 CC 條款授出的既有內容授權。正式內容仍為零；完成本機驗證不代表正式上線。

第 03 票驗收：34 個 Node 測試、33 個 Playwright 測試通過；五種寬度 axe 零違規、無水平溢出。`pnpm verify` 的格式、型別、內容檢查、Node 測試及正式建置通過後，曾因人工畫面檢視的預覽服務仍在執行而中止；停止該服務後，以相同來源完成剩餘 Playwright 測試、正式重建與輸出檢查。標準與規格雙軸審查均無實質發現。

## 第 04 票：搜尋與四種篩選

完整搜尋操作：`pnpm build:fixture && pnpm preview:fixture`，首頁輸入「範例」或景點名稱，搭配縣市、類型、環境、年齡帶縮小結果，使用「清除條件」還原。搜尋按 Enter 或按鈕立即執行，輸入時也會短暫延遲後搜尋；選單可透過原生鍵盤操作。一般 `pnpm dev:fixture` 不產生索引，只提供即時頁面與條件篩選，完整搜尋需重新建置並預覽。

新增固定版本 `pagefind@1.5.2` 作為建置依賴，提供靜態全文索引、中文斷詞與瀏覽器搜尋，不新增伺服器服務。建置 hook、欄位白名單、失敗及無 JavaScript 行為見[公開介面](public-interface.md#搜尋索引與模式)。Astro 設定將資產輸出為外部檔，避免此版本將搜尋程式內嵌時留下尚未完成的 Vite 動態載入引用，並讓瀏覽器可快取搜尋程式。

`pnpm verify` 自動在正式／fixture 建置後各產生該模式索引；最後的正式輸出檢查要求索引模組存在，並比對 Pagefind 的頁數與正式景點數，避免空正式站殘留 fixture 索引。這個筆數檢查不取代後續發布票對私人草稿、同 id 修訂及每個搜尋網址的隔離驗證。現有 YAML 資料契約不變，篩選值由同一批景點推導；沒有另存需要維護的景點資料。

回復此切片時可撤回搜尋 UI、建置 hook、索引檢查及 Pagefind 依賴，重新建置清除產物；景點資料與既有閱讀頁面不需遷移。尚未部署，正式內容仍為零。

第 04 票驗收：36 個 Node 測試與 43 個 Playwright 案例通過，新增搜尋／篩選互動在五種寬度 axe 零違規、無水平溢出。`pnpm verify` 的格式、型別、內容、Node 測試與建置通過，瀏覽器首次為 42/43；唯一失敗是既有「年齡未標示」定位同時命中新選項與卡片。將定位限定於景點列表後，受影響檔案 2/2 通過，接續正式重建與輸出檢查通過；其餘沿用相同來源的通過結果。標準與規格雙軸獨立審查均無實質發現，並已檢視桌面與手機搜尋畫面。


## 第 05 票：本機草稿與修訂預覽

一般開發站使用 `pnpm dev`。正式景點放在 `content/spots/<id>/spot.yaml`，新草稿放在 `drafts/spots/<id>/spot.yaml`；兩者共用相同 schema，不加入 `draft` 欄位。草稿根目錄尚不存在時直接顯示正式內容。首頁與景點頁標示「新草稿」或「修訂中」，所有一般開發頁標示本機預覽並帶 `noindex, nofollow`。研究原文及私人備註放在 `research/`，不寫入景點 YAML。

補充已發布景點：

```sh
pnpm draft:copy <id>
# 編輯 drafts/spots/<id>/spot.yaml；只更新受影響分節與查證日期
pnpm draft:illustrate <id> <image.png> '<替代文字>' # 選填：匯入景點情境插畫
pnpm dev
pnpm draft:diff <id>
```

`draft:copy` 先驗證正式內容，再複製成同 id 草稿；如有插畫，一併複製 PNG。既有草稿一律拒絕覆寫。`draft:illustrate` 將指定 PNG 匯入既有草稿，剝除非像素中繼資料（含原始來源資訊），再寫入固定檔名及標準 YAML 的尺寸與雜湊；原始檔與來源證據留在本機 `research/`。匯入前須人工確認像素內容與使用權利，YAML 的 `kind` 不保證來源。`draft:diff` 驗證草稿後，以 Git 的文字差異顯示 YAML 差異，並列出插畫 SHA-256 差異，不改寫或暫存正式內容。有差異仍回傳成功，指令／資料錯誤才失敗。`draft:copy` 與 `draft:diff` 針對既有正式景點；新草稿先建立 YAML，再用匯入命令加選填 PNG。它們不代表核准、發布或備份，私人資料仍只有本機一份。

### 載入與快取邊界

`loadSpots` 保持單一根目錄、嚴格驗證的載入責任。頁面才透過 `loadPageSpots` 合併正式與草稿，同 id 草稿優先，合併後維持縣市／名稱排序；無效草稿會指出檔案及欄位並中止預覽，不退回正式內容掩蓋錯誤。開發路由 `/spot-illustrations/<id>.png` 使用頁面選定的同一根目錄；正式與 fixture 建置只取各自根目錄。除宣告的 `illustration.png` 外，資料夾圖片、附件與 YAML 圖片語法仍被拒絕，草稿根目錄與景點項目不能以符號連結替代。

Astro integration 根據實際 `dev` 指令注入編譯常數 `__CARLTRAVEL_DRAFT_PREVIEW__`；不使用可被環境變數覆蓋的 `import.meta.env` 欄位，也不根據 `NODE_ENV` 判斷。`build`、`preview`、fixture 模式都不啟用草稿，網站 sitemap 與 Pagefind 沿用既有正式／fixture 載入邊界。完整索引外洩驗證仍由發布票整合。開發模式仍不建立全文索引，可用條件篩選與景點連結審閱內容。

開發站監看 `content/spots/` 與 `drafts/` 的新增、修改、刪除，短暫合併事件後透過 Vite 公開 API 重啟服務，清除 Astro 的 `getStaticPaths` 快取。等終端服務就緒後重新整理頁面；刪除同 id 草稿會恢復正式頁，刪除新草稿則該網址回到 404。不要求人工刪快取。正式建置使用獨立行程與既有 `--force`，不沿用開發路由表。啟動腳本直接呼叫已安裝 Astro 的 CLI，避免巢狀套件管理器在啟動期間重新安裝依賴。

### 私人檔案與驗證

`drafts/`、`research/` 由既有 `.gitignore` 排除，`.prettierignore` 也避免格式化工具讀寫私人檔案；網站不將它們複製到 `content/`、`src/` 或 `public/`。Vite 的檔案拒絕規則保留預設秘密檔保護，另拒絕這兩類路徑的直接請求（含 `/@fs/` 與 raw 匯入）；只有已驗證的景點插畫經專用路由預覽。Astro 啟動／建置前也檢查公開資產，不允許私人目錄、符號連結或未宣告的景點圖片繞過保護；[網站情境插畫](public-interface.md#網站插畫的公開邊界)只按固定路徑與雜湊放行。這不是掃描任意改名私人文字的發布審核；不要手動把私人資料複製到公開路徑，完整私人文字比對仍屬後續發布關卡。

隔離測試在暫存 app 中生成虛構草稿及研究標記，執行真實開發服務、正式建置及 Git 追蹤檢查，不讀寫使用者的私人目錄。覆蓋有效／無效草稿、圖片、同 id 修訂、新增刪除、fixture 開發、開發後正式建置，以及 `NODE_ENV=development` 與同名環境變數干擾。只檢查公開頁面與內容輸出，本票不聲稱完成私人草稿的 Pagefind 查詢整合驗收。

回復此切片可撤回頁面覆蓋載入、預覽 integration、草稿指令與對應測試，再重啟／重建網站。正式 YAML 不需遷移；保留本機 `drafts/` 與 `research/`，不要為回復程式刪除私人內容。本票未部署。

第 05 票驗收：43 個 Node 測試（含實際開發／建置隔離）、43 個 Playwright 案例及格式、型別、正式內容與最後輸出檢查通過。完整 `pnpm verify` 在瀏覽器啟動前因另一專案占用 4321 埠而中止；保留該服務，改用 `E2E_PORT=4337` 接續完整瀏覽器測試、正式重建與輸出檢查。另以虛構草稿檢查首頁／修訂頁的五種寬度，axe 零違規、無水平溢出，並檢視手機與桌面畫面。標準與規格雙軸審查均無實質發現；沒有新增依賴。


## 第 06 票：來源研究到送審

內容製作入口為 [.claude/skills/carltravel-research/SKILL.md](../.claude/skills/carltravel-research/SKILL.md)，命令入口為 `pnpm research --help`。工具配發來源 id、保存讀取證據／原文與 Carl 的既有不可讀決定、比對景點同一性，並檢查指定草稿的原文與私人備註重疊。它們不修改正式內容、不開 PR；流程與回復見[研究工具](research.md)，責任邊界見[架構文件](architecture.md)。

新增測試仍使用一次性 app 與虛構資料。原文比對的 Unicode 正規化、12 字門檻、引文與私人備註的不同範圍、混合來源、不可讀例外與遺失原文均有正反案例；另外演練本機紀錄、人工測試決定、同 id 修訂、差異、實際預覽與送審。程式關卡不證明官方來源品質或真人核准，skill 與 Carl 的決策節點保留這些責任。沒有新增依賴。

第 06 票驗收：`E2E_PORT=4337 pnpm verify` 完整通過，包含 51 個 Node 測試、43 個 Playwright 案例、格式／型別／正式內容、建置與最後輸出檢查。獨立審查後補強原文還原雜湊、精確加部分同一性衝突，以及研究紀錄原子寫入；新增回歸測試先失敗再通過，修正後 10 個研究 focused 測試與型別檢查通過。沿用未變動網站的完整瀏覽器結果，未重跑無關驗證。

標準與規格雙軸獨立審查完成；三項 P2 及損毀雜湊的延伸情境均已修正，原 reviewer 複查無剩餘實質發現。

## 第 07 票：審閱通過到發布 PR

已核准內容的操作入口見 [發布工具](publishing.md)。本機批次綁定草稿及正式基準 hash，prepare 只產生標準公開 YAML，submit／ready 透過 Git 與 gh 邊界執行並回讀遠端結果。私人核准、版本紀錄及失敗診斷留在 research/；正式內容、來源研究與使用者的真實 GitHub PR 均未作為本票測試資料。

公開 PR workflow 直接執行共用 verify。新增固定版本 Wrangler 與其 workerd 安裝腳本許可，因票面要求真實 Worker dry-run；使用最小靜態 assets 設定，沒有新增 Cloudflare 密鑰、帳號、網域或正式部署工作流程。`check:index` 使用已存在的 Playwright／Chromium 查詢實際 Pagefind；零景點的 Pagefind 沒有 language runtime，驗證空 metadata 與空正式頁集合，不偽造搜尋結果。

測試包含隔離 app 的 dev→正式 build、頁面／sitemap／真實索引的草稿與同 id 修訂排除、故意污染索引的失敗案例，以及核准版本、重疊／私人引文、圖片、原文遺失與不可讀例外。GitHub 邊界使用真實暫存 Git repo 配合模擬 gh／push，驗證 draft、CI 阻擋、head 改變、更新既有 PR、已合入分支阻擋、歷史私人檔案及推送後 gh 失敗。未建立真實發布 PR，雲端 CI 執行留真實 PR 驗收。

第 07 票驗收：完整 `E2E_PORT=4337 pnpm verify` 通過 58 個 Node、43 個 Playwright 與全部共用關卡（包含 Wrangler dry-run）。審查後補強固定 commit 推送、私人錯誤輸出、ready 後摘要核對及孤立草稿連結。重複發布演練另在單獨執行時重現 Pagefind metadata 空檔：既有原生 writeFiles 寫入後 close 會立即終止後端，現改用 getFiles 取得檔案資料，由 Node await 寫入後再 close；沿用原來的明確景點白名單。介面依 [Pagefind Node API](https://pagefind.app/docs/node-api/)，原生行為核對 [v1.5.2 output](https://github.com/pagefind/pagefind/blob/v1.5.2/pagefind/src/output/mod.rs)。

最終增量驗證通過 10 個相關 Node 測試、10 個搜尋 Playwright 案例、型別檢查（零診斷）、正式重建、輸出／實際索引與 Wrangler dry-run。標準軸四項發現與索引寫檔問題已由原 reviewer 複查結案；規格軸無實質發現。沒有推送、真實 PR 或正式部署；雲端 CI 的實際執行仍待真實 PR。

## 正式部署準備

第 08 票的 main 流程、部署門檻、dry-run 與待補雲端設定見 [部署文件](deployment.md)。`pnpm verify` 允許零正式景點；`pnpm prepare:deployment` 必須至少一個核准景點，且只準備產物、不執行正式部署。
