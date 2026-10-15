// PROTOTYPE：用同一份 schema 驗證兩種格式，再各做一次「寫錯」的變造，比較哪些錯誤能被擋下。
// 執行：bun validate.ts
import { readFileSync } from "node:fs";
import { spotSchema } from "./schema.ts";

const dir = import.meta.dir;
const yamlText = readFileSync(`${dir}/A-yaml/shanlan-woodcarving-kids-museum/spot.yaml`, "utf8");
const mdText = readFileSync(`${dir}/B-markdown/shanlan-woodcarving-kids-museum/spot.md`, "utf8");

function splitFrontmatter(text: string) {
  const [, fm, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
  return { data: Bun.YAML.parse(fm), body };
}

function report(label: string, data: unknown) {
  const result = spotSchema.safeParse(data);
  if (result.success) return console.log(`✅ ${label}`);
  console.log(`❌ ${label}`);
  for (const issue of result.error.issues) console.log(`   ${issue.path.join(".")}：${issue.message}`);
}

const a = Bun.YAML.parse(yamlText) as any;
const b = splitFrontmatter(mdText);

console.log("── 原樣 ──");
report("A 整份 YAML", a);
report("B frontmatter（內文 schema 看不到）", b.data);

console.log("\n── 變造 1：原作者心得指向不存在的來源 ──");
report("A：authorNotes[0].source = blog-x", { ...a, authorNotes: [{ ...a.authorNotes[0], source: "blog-x" }] });
const bBody1 = b.body.replace("### blog-a", "### blog-x");
report("B：內文標題改成 ### blog-x", splitFrontmatter(mdText.replace(b.body, bBody1)).data);

console.log("\n── 變造 2：引文超過 60 字、一個來源放三段 ──");
const longQuote = "磨到最後木頭變得滑滑的，孩子一直拿來貼臉頰，還說要帶回家當枕頭，旁邊的志工阿姨笑著說每個小朋友都這樣，然後又教他用更細的砂紙再磨一次。";
report("A：quotes 三段且一段過長", { ...a, authorNotes: [{ ...a.authorNotes[0], quotes: [longQuote, "第二段", "第三段"] }] });
const bBody2 = b.body.replace("> 磨到最後", `> ${longQuote}\n\n> 第二段\n\n> 第三段\n\n> 磨到最後`);
report("B：內文三段引文且一段過長", splitFrontmatter(mdText.replace(b.body, bBody2)).data);

console.log("\n── 變造 3：「跟孩子一起看」的事實沒有附出處 ──");
report("A：withKids.facts[0] 移除 ref", { ...a, withKids: { ...a.withKids, facts: [{ text: a.withKids.facts[0].text }] } });
report("B：內文移除 [^site] 註腳", splitFrontmatter(mdText.replace("[^site]", "")).data);
