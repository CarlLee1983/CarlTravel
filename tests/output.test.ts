import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkOutput } from "../scripts/check-output.ts";

test("output gate requires built pages and rejects fixture leakage", async () => {
  const root = await mkdtemp(join(tmpdir(), "carltravel-output-"));
  const output = join(root, "dist");
  const content = join(root, "content");
  try {
    await mkdir(content);
    await assert.rejects(checkOutput(output, content), /ENOENT/);
    await mkdir(output);
    await writeFile(join(output, "index.html"), "");
    await assert.rejects(checkOutput(output, content), /missing HTML/);
    await writeFile(
      join(output, "index.html"),
      "<html><main>目前尚無公開景點</main></html>",
    );
    assert.equal(await checkOutput(output, content), 0);
    await writeFile(
      join(output, "index.html"),
      "<html><main>範例親子公園</main></html>",
    );
    await assert.rejects(checkOutput(output, content), /fixture marker/);
    await writeFile(
      join(output, "index.html"),
      "<html><main>景點</main></html>",
    );
    await mkdir(join(output, "spots", "unexpected"), { recursive: true });
    await assert.rejects(checkOutput(output, content), /differ/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("matching spot directory without page is not a successful build", async () => {
  const root = await mkdtemp(join(tmpdir(), "carltravel-page-"));
  try {
    await writeFile(join(root, "index.html"), "<html><main>首頁</main></html>");
    await mkdir(join(root, "spots", "example-park"), { recursive: true });
    await mkdir(join(root, "spots", "example-museum"), { recursive: true });
    await assert.rejects(checkOutput(root, "tests/fixtures/spots"), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("formal output rejects spot image assets even outside YAML content", async () => {
  const root = await mkdtemp(join(tmpdir(), "carltravel-image-output-"));
  try {
    const output = join(root, "dist");
    const content = join(root, "content");
    await mkdir(output);
    await mkdir(content);
    await writeFile(
      join(output, "index.html"),
      "<html><main>首頁</main></html>",
    );
    await writeFile(join(output, "spot-photo.webp"), "fixture");
    await assert.rejects(checkOutput(output, content), /圖片/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
