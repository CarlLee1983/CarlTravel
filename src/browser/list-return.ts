// 景點頁返回入口：從列表進來時改成「回到剛才的列表」並連回該列表網址。
// 來源取 document.referrer（同源的列表網址），不用 sessionStorage：
// 它不跨分頁與重新整理出錯，也沒有寫入失敗（隱私模式）要處理，且不留任何持久資料。
// 在新分頁開啟卡片時，瀏覽器仍會帶 referrer，所以算列表來源；該分頁沒有上一筆紀錄，
// 點擊時直接導向網址。沒有 JavaScript 或直接進站時維持靜態的 `/`。
import { listUrlFromReferrer } from "../content/list-url.ts";

const link = document.querySelector<HTMLAnchorElement>("a[data-list-return]");
const from = link && listUrlFromReferrer(document.referrer, location.origin);

if (link && from) {
  link.textContent = "← 回到剛才的列表";
  link.setAttribute("href", from);
  link.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    // 有上一筆紀錄時，上一筆就是列表（referrer 為證），用 back() 讓捲動與焦點由 history.state 還原。
    // 章節錨點會 pushState 多一筆，此時上一筆不是列表，改為導向網址。
    if (history.length > 1 && location.hash === "") {
      event.preventDefault();
      history.back();
    }
  });
}
