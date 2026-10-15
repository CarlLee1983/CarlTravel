# CarlTravel 視覺方向原型

單一離線 HTML，三種結構不同的首頁與景點頁。所有景點、地址、票價、時間與來源均為虛構，只供討論視覺方向。其餘兩個列表景點只有預覽資料，沒有詳細頁。

在儲存庫根目錄執行：

```sh
python3 -m http.server 8000
```

開啟 `http://localhost:8000/.scratch/carltravel-v1/prototypes/10-visual-direction/index.html?variant=A&page=home`。將 `variant` 改為 `B` 或 `C`，`page` 改為 `spot` 可直接連到其他畫面；頁面下方也有切換器。首頁搜尋與篩選只作用於記憶體中的三筆示意資料。

Carl 選定的組合版為 `?variant=D&page=home`：A 字體、B 首頁、C 景點目錄。`page=spot` 可查看景點頁；A／B／C 保留供比較。D 使用藍灰配色統一兩頁。
