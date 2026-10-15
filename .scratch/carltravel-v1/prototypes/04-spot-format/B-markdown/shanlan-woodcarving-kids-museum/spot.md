---
# PROTOTYPE：格式 B，結構化欄位放在 frontmatter，敘述放在內文。景點、網址與內容皆為虛構。
name: 山嵐木雕親子館
address: 苗栗縣三義鄉廣聲新城 88 號
county: 苗栗縣
district: 三義鄉
location: { lat: 24.4136, lng: 120.7652 }
tourismId: C1_PROTO_0001
summary: 以木雕為主題的室內展館，設有小朋友可以動手打磨的體驗區，適合雨天前往，停留時間約兩小時。
tags: [室內, 雨天備案]

officialRefs:
  - id: site
    title: 山嵐木雕親子館官方網站－參觀資訊
    url: https://example.com/shanlan/visit
    publisher: 山嵐木雕文化基金會
  - id: county-tourism
    title: 苗栗文化觀光旅遊網－山嵐木雕親子館
    url: https://example.com/miaoli-travel/spot/1234
    publisher: 苗栗縣政府

sources:
  - id: blog-a
    title: 三義雨天好去處！山嵐木雕親子館半日遊
    url: https://example.com/blog-a/shanlan
    author: 小樹媽媽的週末
    readAt: 2026-10-15
  - id: blog-b
    title: 苗栗親子景點懶人包
    url: https://example.com/blog-b/miaoli
    author: 爸爸帶路
    readAt: 2026-10-15
    readable: false

official:
  transport:
    checkedAt: 2026-10-15
    facts:
      - { status: ok, label: 大眾運輸, value: 臺鐵三義站下車，轉乘苗栗客運 5 號至「廣聲新城」站，步行約 5 分鐘, ref: site }
      - { status: ok, label: 停車, value: 館前設有小型車停車場，約 40 格, ref: site }
      - { status: unpublished, label: 停車費 }
  hoursAndFees:
    checkedAt: 2026-10-15
    facts:
      - { status: ok, label: 開放時間, value: 09:00–17:00，週一休館（逢國定假日照常開放）, ref: site }
      - status: conflict
        label: 假日全票
        claims:
          - { value: 150 元, ref: site }
          - { value: 120 元, ref: county-tourism }
        contact: 山嵐木雕親子館服務台 037-000-000
      - { status: ok, label: 免票對象, value: 未滿 6 歲兒童、65 歲以上長者、身心障礙者及一名陪同者, ref: site }

familyChecklist:
  checkedAt: 2026-10-15
  stroller: { value: yes, ref: site, note: 全館設有坡道與電梯 }
  nursingRoom: { value: yes, ref: site, note: 位於一樓服務台旁 }
  familyRestroom: { value: unknown }
  rainyDay: { value: yes, ref: site, note: 展區與體驗區都在室內 }
  ageRange: { value: yes, ref: site, note: 體驗區建議 4 歲以上 }
  accessibility: { value: yes, ref: site, note: 無障礙廁所與無障礙停車位 }

nearby:
  - { name: 廣聲新城老街, kind: activity, note: 步行約 10 分鐘，可順道散步, source: blog-a }
---

## 原作者心得

### blog-a

作者在下雨的週六帶兩個孩子前往，體驗區要先在服務台登記梯次，假日上午的梯次很快額滿，建議一到館就先登記，再去逛展區。五歲的老二對打磨小木塊最有興趣，大約待了四十分鐘。

> 磨到最後木頭變得滑滑的，孩子一直拿來貼臉頰。

## Agent 建議

- 體驗區採梯次制，假日建議開館後先到服務台登記，再安排參觀展區。
- 館方未公布停車費，自行開車前可先致電詢問。

## 跟孩子一起看

館內展示的樟木雕刻，是三義早期木雕產業常用的材料。[^site]

- 請孩子在展區找出三種不同的動物木雕，比較它們的木紋。

[^site]: 見官方出處 site。
