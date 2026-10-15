---
status: accepted
---

# 草稿與研究紀錄只存在本機，不進 Git

CarlTravel 的草稿放在 `drafts/`，研究紀錄（原文摘錄、Carl 的私人備註、查證過程）放在 `research/`，兩者都列入 `.gitignore`。公開儲存庫只收審閱通過的景點內容，以及規劃文件。

這是刻意偏離 CarlKitchen 的做法。CarlKitchen 把草稿（`draft: true`）、`.scratch/` 研究中間檔與內部來源紀錄都 commit 進公開 repo，只靠「不進 build 輸出」與外洩檢查把關。這種做法下，私人備註雖然不會出現在網站上，在 GitHub 上仍然看得到。CarlTravel 的需求是私人備註與研究中間紀錄不得進入公開 Git 儲存庫，所以不能沿用。

代價是草稿和研究紀錄沒有版本歷史，也沒有異地備份，換機或硬碟損壞就會遺失。v1 是單人單機作業，這個代價可以接受。另一個選項是另開 private repo 存放，但這會讓兩個 repo 必須保持同步，因此不採用。

**Falsified if:** `.gitignore` 不再排除 `drafts/` 或 `research/`，或者需要多台機器、多人協作撰寫草稿。
