# 自動品質檢查與發布關卡

Type: grilling
Status: open
Blocked by: 04, 05

## Question

品質規則要分成兩類：哪些由 `check:content` 或 CI 機械性擋下、阻止合入與部署；哪些只寫在 skill 裡，交給 Agent 自查和 Carl 審閱？候選規則包括：

- 外洩檢查：build 輸出中不得出現任何草稿 id、研究紀錄內容或私人備註標記。
- 照抄比對：參考 CarlKitchen ADR 0009 的「12 字以上相同片段」門檻，在景點文字與 `research/` 原文摘錄之間比對。但 CI 讀不到 `research/`，所以要決定是在本機執行還是在 PR 前執行。
- 結構檢查：官方資訊必須逐條附來源；分節必須有查證日期；有／無項目必須附來源；直接引用的長度上限。
- 過期提示（12 個月）只是顯示，不擋 build。
- 照抄比對的比對對象：依票 05，`research/<來源 id>/original.txt` 在本機存有原文全文，這裡只需要決定何時、何處執行比對。
- 圖片：v1 是否直接禁止內容目錄出現圖片檔。
- 無障礙與版面：Playwright+axe 涵蓋哪些頁面。

另外要決定：哪些檢查在 PR 上跑、哪些在 deploy 前跑，以及失敗時如何回報給 Carl。
