# 景點內容模型與公開檢查

實作以 [v1 母規格](../.scratch/carltravel-v1/issues/11-carltravel-v1-spec.md) 為準，不使用早期格式原型的 schema。型別與執行期驗證共用 `src/content/schema.ts`；所有頁面及 `check:content` 透過 `loadSpots()` 載入。

## 單檔與基本資訊

正式景點放在 `content/spots/<id>/spot.yaml`。id 取自資料夾，必須符合小寫 ASCII 英數字與連字號分隔；發布後保持穩定。目錄只接受 `spot.yaml`，以及有選填 `illustration` 時與 YAML 同層的 `illustration.png`。本機草稿放在 `drafts/spots/<id>/spot.yaml`，共用此 schema，YAML 不加入 draft 欄位；位置決定草稿身分。開發預覽同 id 草稿優先，正式建置只讀 `content/spots/`。詳見[草稿操作](development.md#第-05-票本機草稿與修訂預覽)。

必填 `name`、`address`、`county`、`district`、`kind`、`setting`、`summary`、`ageRange`、`officialRefs`、`transport`、`hoursAndFees`、`familyChecklist`。縣市是 22 縣市列舉，行政區比對[官方快照](../src/data/README.md)，一律使用「臺」。摘要最多 30 個 Unicode 碼點。`kind` 與 `setting` 的封閉值域見 schema，不接受任意標籤。

`ageRange` 是 `{ status: unknown }`，或 `{ status: known, min: 3, max: 12, ref: office }`；`max` 可省略表示無上限，年齡必須是非負整數，上限不得小於下限。`location` 可選，使用 `{ lat, lng }` 的有效經緯度。地圖連結優先使用座標，無座標時以名稱與地址搜尋，不嵌入地圖。

## 官方資訊與出處

`officialRefs` 每筆都有 `id`、`title`、HTTP(S) `url`、`organization` 與 `kind`。`kind: page` 是一般頁面；`kind: openData` 另必填 `purpose: positioning | facts` 及 `attribution: { provider, year, dataset, version }`，年份為整數，其餘為非空文字，公開來源區會顯示完整顯名。

選填的 `tourismId` 使用 `{ value, ref }`，其中 `ref` 必須指向 `kind: openData` 且 `purpose: positioning`。顯名出處藉定位用途即算有效使用；任何 `purpose: positioning` 的出處（包括其他 id 或未被定位 ID 使用者）不得用於年齡、官方事實、親子清單或跟孩子一起看的查證。其他未使用出處仍拒絕。觀光署定位資料必須標為 `positioning`，不代替費用或設施的研究查證。其他確實用於官方事實的開放資料標為 `facts`；用途分類與原始資料是否相符仍需研究及人工審閱，程式不以機關名稱字串猜測用途。

`transport`、`hoursAndFees` 與選填 `facilities` 共用 `{ checkedAt, facts }`。日期必須是有效的 `YYYY-MM-DD`，事實清單至少一筆：

| 狀態          | 必填欄位與呈現                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `ok`          | `label`、`value`、`ref`；逐條連到官方出處                                                                 |
| `unpublished` | `label`；顯示「官方未公布」                                                                               |
| `conflict`    | `label`、至少兩筆 `claims: [{ value, ref }]`（須有不同值與不同出處）、`contact`；並列說法、出處與聯絡提示 |

`familyChecklist` 有獨立 `checkedAt`；`stroller`、`nursingRoom`、`familyToilet`、`rainyDay`、`accessibility` 預設 `{ status: unknown }`，呈現「未知」。`status: yes` 或 `no` 必填 `ref`，可填 `note`，分別呈現「有」與「無」；清單外說明使用 `notes`。未知不等於沒有。

`withKids` 可省略；存在時必須有 `checkedAt`、至少一條 `facts: [{ text, ref }]`，可另有 `activities` 字串陣列。官方事實附出處，觀察活動標示為 Agent 建議；不為缺乏資料的景點填造內容。

每個官方資訊分節呈現查證日期。以建置時的 UTC 日期判斷：超過查證日的 12 個日曆月周年日才顯示「資料可能過期」，恰好周年日不提示；閏年 2 月 29 日的下一年周年取 2 月 28 日。過期只提示，不阻擋載入或建置。

## 來源、心得與建議

`sources` 預設空陣列；純官方資料景點保持 `sources: []`、`authorNotes: []`，其官方事實仍須使用 `officialRefs`。有旅遊來源時，每筆包含 `id`、`title`、HTTP(S) `url`、`author`、`readAt`、`readable`。與官方出處分開，各清單內 id 不可重複。不可讀來源在公開來源清單標示「原文無法讀取」，本身算有效溯源；不能用它產生心得或引文。其 Carl 核准紀錄由後續本機發布關卡驗證，不寫入公開 YAML。

`authorNotes` 預設空陣列，每筆為 `{ source, summary, quotes? }`，指向可讀來源，轉述後可附引文。頁面附原作者與連結。每個來源跨所有心得筆數合計最多兩段引文，每段最多 60 個 Unicode 碼點（標點及內部換行也計入），寫作目標仍是約 50 字以內。引文之外的公開文字欄位不得含「我」（包含「我們」）；標題、署名等顯示文字也接受此檢查，連結網址不當作敘述文字。

`agentTips` 是獨立的字串陣列。`nearby` 每筆為 `{ name, kind, note, source? }`，`kind` 只能是 `food`、`stay`、`activity`，選填來源必須存在。原作者心得、Agent 建議、周邊安排省略或空陣列時不產生空白分節。可讀來源必須被心得或周邊安排使用，不能任意堆積未用來源。

## 景點情境插畫

選填 `illustration: { kind: 'ai-generated', alt, sha256, width, height }` 只指向同目錄的 `illustration.png`，不接受圖片網址、照片或圖庫。替代文字 `alt` 描述畫面；頁面固定顯示「AI 生成情境插畫，非實際展區」。載入器檢查 PNG 區塊、CRC 與解壓後像素，只接受非交錯的 8-bit 灰階或 RGB（可含 alpha）；拒絕夾帶的輔助中繼資料，並驗證 SHA-256 與宣告尺寸相符。檔案不超過 8 MiB，寬高均不超過 4096px；缺檔、額外附件或不符宣告均拒絕。插畫是情境示意，不能作為設施或展區事實的證據。`kind` 是內容標示，不是來源或權利的保證；匯入前仍須人工確認圖像內容及使用權利。

## 驗證邊界

- 載入入口拒絕未知欄位、錯誤資料型別、無效參照、未使用來源／出處、缺出處、無效行政區與日期、引文超限及第一人稱。
- 除上述 `illustration` 與成對 PNG，其他圖片欄位、Markdown 圖片與 HTML 圖片標記（包含引文內）、景點目錄附件均被拒絕。正式輸出只接受與正式 YAML 宣告雜湊完全相符的景點 PNG；網站共用插畫另依[公開資產邊界](public-interface.md#網站插畫的公開邊界)檢查。
- 所有敘述以文字輸出，不執行 YAML 內 HTML。網址只允許 HTTP(S)。網站不在建置時抓取外部出處；可連結不代表已查證其真實性。
- `pnpm check:content` 檢查正式內容；`pnpm verify` 整合內容、型別、單元、正式建置、fixture 瀏覽器與正式輸出檢查。錯誤列出檔案與欄位。

完整虛構案例在 `tests/fixtures/spots/example-museum/spot.yaml`；最小案例仍是 `example-park`。測試只用虛構資料，不混入 `content/spots`。真實查證、旅遊來源可讀核准、純官方資料的勾選與備註檢查、重疊檢查及發布授權由本機流程處理；schema 不代替人工審閱。
