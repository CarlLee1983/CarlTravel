import test from "node:test";
import assert from "node:assert/strict";
import { listUrlFromReferrer } from "../src/content/list-url.ts";

const origin = "https://carl.example";

test("同源的列表網址原樣回傳路徑與查詢，去掉錨點", () => {
  assert.equal(listUrlFromReferrer(`${origin}/`, origin), "/");
  assert.equal(listUrlFromReferrer(`${origin}/page/2/`, origin), "/page/2/");
  assert.equal(
    listUrlFromReferrer(
      `${origin}/?county=%E6%96%B0%E5%8C%97%E5%B8%82&page=2#x`,
      origin,
    ),
    "/?county=%E6%96%B0%E5%8C%97%E5%B8%82&page=2",
  );
});

test("空值、外站、非列表路徑、壞網址都不算列表來源", () => {
  assert.equal(listUrlFromReferrer("", origin), null);
  assert.equal(listUrlFromReferrer("https://other.example/", origin), null);
  assert.equal(listUrlFromReferrer(`${origin}/about/`, origin), null);
  assert.equal(listUrlFromReferrer(`${origin}/spots/a/`, origin), null);
  assert.equal(listUrlFromReferrer(`${origin}/page/x/`, origin), null);
  assert.equal(listUrlFromReferrer(`${origin}/page/1/`, origin), null);
  assert.equal(listUrlFromReferrer(`${origin}/page/2/?q=1`, origin), null);
  assert.equal(listUrlFromReferrer("not a url", origin), null);
});
