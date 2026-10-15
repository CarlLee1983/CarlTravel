# 行政區清單

`districts.json` 是內政部國土測繪中心「代碼服務－鄉鎮市區清單（戶政）」2026 年資料快照，2026-10-15 取得；共 22 縣市、368 鄉鎮市區。驗證使用本機快照，不在建置期間連線。

- 資料集：https://data.gov.tw/dataset/102011
- 縣市清單：https://api.nlsc.gov.tw/other/ListCounty
- 各縣市行政區：https://api.nlsc.gov.tw/other/ListTown1/{countycode}
- 授權：政府資料開放授權條款第 1 版，https://data.gov.tw/license

更新時依縣市代碼讀取全部清單，只保留 countyname → townname 陣列；檢查縣市完整性、名稱差異後提交審閱。此資料僅作行政區名稱驗證，不是景點出處。
