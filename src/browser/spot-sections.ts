// 景點頁摺疊列：從網址錨點或「出發前確認」卡進入時，展開目標章節並把焦點放到摘要。
// 沒有這支腳本時，原生 <details> 仍可手動展開。
function reveal(id: string): boolean {
  const target = id ? document.getElementById(id) : null;
  if (!(target instanceof HTMLDetailsElement)) return false;
  target.open = true;
  const summary = target.querySelector("summary");
  // focus() 會把摘要捲進視窗
  summary?.focus();
  return true;
}

const hashId = () => decodeURIComponent(location.hash.slice(1));

reveal(hashId());
// 瀏覽器在載入完成時才處理網址錨點，會把焦點清掉，所以載入後再聚焦一次
if (document.readyState === "complete") reveal(hashId());
else addEventListener("load", () => reveal(hashId()), { once: true });
addEventListener("hashchange", () => reveal(hashId()));
document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  const link = (event.target as Element).closest<HTMLAnchorElement>(
    "a[data-open]",
  );
  if (!link) return;
  const id = decodeURIComponent(new URL(link.href).hash.slice(1));
  // 預設的錨點跳轉會在非可聚焦目標上清掉焦點，所以自己處理並寫入歷史
  if (!reveal(id)) return;
  event.preventDefault();
  history.pushState(null, "", link.hash);
});
