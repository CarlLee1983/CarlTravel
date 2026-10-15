# 景點內容檔的格式

Type: prototype
Status: resolved
Assignee: Carl
Blocked by: 01

## Question

一筆景點在 `content/spots/<id>/` 裡要長成什麼樣子，才能同時滿足以下需求：

- 讓 Astro content collection 以 schema 驗證；
- 讓 Agent 能穩定寫出內容、讓 Carl 讀得懂；
- 能表達票 01 決定的所有結構：逐條官方來源、分節查證日期、三類資訊分開、有／無／未知清單、未知與衝突狀態、來源清單、選填的「跟孩子一起看」。

需要做出決定的問題：

- 用 YAML 單檔，還是 Markdown 加 frontmatter（結構化欄位放 frontmatter，敘述放內文）？兩者如何分工？
- 官方資訊的「逐條附來源」怎麼表示？例如每條 `{ value, sourceRef }`，或在內文段落加註腳。
- 衝突狀態的資料形狀：如何並列各方說法與來源。
- 景點 id（slug）的命名規則，以及縣市、鄉鎮區的欄位與值域。
- 主題標籤（室內、戶外、雨天備案、年齡等）要放在哪裡；值域在票 07 決定，這裡只預留位置。

做法：用一個虛構但寫實的景點，以兩種候選格式各寫一份，加上一份對應的 zod schema 草案，讓 Carl 直接比較。原型只作為討論素材，不進入正式內容。

## Answer

以下由 Carl 於 2026-10-15 確認。原型（兩種格式、zod schema 草案、驗證腳本）放在 [prototypes/04-spot-format/](../prototypes/04-spot-format/)，只作討論素材。原型保留在 `.scratch/` 與地圖一起 commit，不另開分支（Carl 於 2026-10-15 決定）。重現方式：在該目錄執行 `bun validate.ts`。

### 檔案格式：單一 YAML

- 一個景點一個資料夾，內容寫在 `content/spots/<id>/spot.yaml`（草稿是 `drafts/spots/<id>/spot.yaml`）。Astro 用 `glob` 載入 `*/spot.yaml`，id 取自資料夾名稱，做法同 CarlKitchen 的 recipes。
- 敘述（原作者心得的轉述摘要、Agent 建議、跟孩子一起看）用 YAML 區塊字串寫在同一個檔案，不採用 Markdown 加 frontmatter。理由：原型驗證中，「心得指向不存在的來源」「引文超過兩段或過長」「事實沒有附出處」這三種錯誤，YAML 版全部由 schema 擋下；Markdown 版的內文不經過 schema，三種錯誤都會通過，必須另寫解析器。景點的敘述都很短，YAML 的可讀性代價可以接受。

### 景點 id 與地區

- id 只能用小寫 ASCII 單字，以連字號連接（`^[a-z0-9]+(?:-[a-z0-9]+)*$`）。官方有英文名時用英文名，沒有就用漢語拼音，不加縣市前綴。
- `county` 是 22 個直轄市與縣市的列舉值，一律寫「臺」。`district` 是自由字串，由 `check:content` 比對官方行政區清單。
- 選填 `location: { lat, lng }`，用來產生 Google Maps URLs 與 OSM 連結；選填 `tourismId`（觀光署開放資料 ID），只用來定位景點。

### 出處與官方資訊

- 檔案內分成兩份清單：`officialRefs`（官方出處：`id`、標題、網址、經營者或機關）與 `sources`（來源：`id`、標題、網址、作者或網站、`readAt`、`readable`）。`readable: false` 時，公開頁顯示「原文無法讀取」。
- 官方資訊分成 `transport`（交通與停車）、`hoursAndFees`（開放時間與費用）、選填的 `facilities`，每節都有 `checkedAt` 與 `facts[]`。每條事實是以 `status` 區分的聯集：`ok`（`label`、`value`、`ref`）、`unpublished`（官方未公布）、`conflict`（並列至少兩筆 `claims[{value, ref}]`，並附 `contact`）。
- 所有 `ref` 都必須指向檔內的 `officialRefs[].id`，原作者心得的 `source` 都必須指向 `sources[].id`。這由 schema 的 `superRefine` 檢查。

### 親子清單與建議年齡

- `familyChecklist` 有 `checkedAt`，以及五個項目：推車友善、哺乳室、親子廁所、雨天備案、無障礙設施。每項是 `unknown`（預設），或 `yes`／`no` 加上必填的 `ref` 和選填的 `note`。清單以外的資訊寫在自由文字欄 `notes`。
- **修正票 01**：「建議年齡」移出清單，改成獨立欄位，形狀是 `{ min?, max?, ref }` 或 unknown，讓票 07 可以拿來篩選。欄位細節在實作階段決定。

### 其他分節

- `authorNotes[]`：`source`、轉述 `summary`，以及最多兩段 `quotes`（schema 上限 60 字）。
- `agentTips[]`；選填的 `withKids`，包含 `facts[{text, ref}]` 與屬於 Agent 建議的 `activities[]`。
- `nearby[]`（周邊安排）：`name`、`kind`（food／stay／activity）、`note`，以及選填的 `source`。
- `tags[]` 先預留在頂層，值域由票 07 決定。
