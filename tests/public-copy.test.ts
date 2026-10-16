import test from "node:test";
import assert from "node:assert/strict";
import { maskPublicCopy } from "../scripts/publish/public-copy.ts";
import { outingSocialAlt } from "../src/site.ts";

const meta = `<meta property="og:image:alt" content="${outingSocialAlt}">`;
const document = (head: string) =>
  `<!doctype html><html><head>${head}</head><body></body></html>`;
const slots = { social: true, transport: false };

test("public masks preserve preceding comment/script probes and touch only real source spans", () => {
  for (const prefix of [
    `<!--privateprobe${meta}-->`,
    `<script>const probe = 'privateprobe${meta}'</script>`,
  ]) {
    const html = document(prefix + meta);
    assert.equal(
      maskPublicCopy(html, slots),
      document(prefix + '<meta property="og:image:alt" content="">'),
    );
    assert.ok(maskPublicCopy(html, slots).includes(`privateprobe${meta}`));
  }
});

test("noncanonical real attributes never cause a canonical comment to be masked", () => {
  const html = document(
    `<!--privateprobe${meta}-->` + meta.replace("步", "&#27493;"),
  );
  assert.equal(maskPublicCopy(html, slots), html);
});

test("duplicate attributes fail closed and other attribute bytes stay unchanged", () => {
  const duplicate = document(
    meta.replace("<meta ", '<meta content="privateprobe" '),
  );
  assert.equal(maskPublicCopy(duplicate, slots), duplicate);
  const tagged = meta.replace("<meta ", '<meta data-probe="$&privateprobe" ');
  assert.equal(
    maskPublicCopy(document(tagged), slots),
    document(tagged.replace(outingSocialAlt, "")),
  );
  assert.equal(
    maskPublicCopy(document(meta), { social: false, transport: false }),
    document(meta),
  );
});
