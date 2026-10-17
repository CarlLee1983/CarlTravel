// 列表的最終順序：縣市北到南、同縣市依名稱，名稱相同再依 id。
// 建置時寫進列表 JSON，靜態分頁與瀏覽器端沿用同一份順序，
// 不在瀏覽器重排（兩邊的 ICU 不同，重排會讓翻頁漏筆或重複）。
// 瀏覽器會打包此檔，不得引用 node 模組。
import { counties } from "./counties.ts";

const collator = new Intl.Collator("zh-Hant");
const countyRank = new Map<string, number>(
  counties.map((county, index) => [county, index]),
);

export function compareListOrder(
  a: { county: string; name: string; id: string },
  b: { county: string; name: string; id: string },
) {
  return (
    (countyRank.get(a.county) ?? Infinity) -
      (countyRank.get(b.county) ?? Infinity) ||
    collator.compare(a.name, b.name) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
