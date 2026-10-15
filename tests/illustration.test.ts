import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { workspace, devServer } from "./helpers/workspace.ts";
import { loadSpots } from "../src/content/load.ts";
import { crc32, deflateSync } from "node:zlib";
import { normalizeIllustration } from "../src/content/illustration.ts";
import { checkOutput } from "../scripts/check-output.ts";

// A synthetic single pixel, never a real research asset.
export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);
export const metadata = {
  kind: "ai-generated",
  alt: "虛構插畫測試",
  width: 1,
  height: 1,
  sha256: createHash("sha256").update(png).digest("hex"),
};

test("illustrations require declared, matching regular PNG attachments", async () => {
  const { root, cleanup } = await workspace();
  const dir = join(root, "content/spots/approved-park");
  const yaml = join(dir, "spot.yaml");
  const image = join(dir, "illustration.png");
  try {
    const data = parse(await readFile(yaml, "utf8"));
    data.illustration = structuredClone(metadata);
    await writeFile(yaml, stringify(data));
    await assert.rejects(loadSpots(join(root, "content/spots")), /ENOENT/);
    await writeFile(image, png);
    assert.equal(
      (await loadSpots(join(root, "content/spots")))[0]!.illustration!.sha256,
      metadata.sha256,
    );
    await writeFile(image, Buffer.concat([png, Buffer.from("private bytes")]));
    await assert.rejects(loadSpots(join(root, "content/spots")), /PNG/);
    await rm(image);
    await writeFile(join(root, "outside.png"), png);
    await symlink(join(root, "outside.png"), image);
    await assert.rejects(loadSpots(join(root, "content/spots")));
    await rm(image);
    await writeFile(image, png);
    data.illustration.width = 2;
    await writeFile(yaml, stringify(data));
    await assert.rejects(loadSpots(join(root, "content/spots")), /PNG/);
    delete data.illustration;
    await writeFile(yaml, stringify(data));
    await assert.rejects(loadSpots(join(root, "content/spots")), /附件/);
  } finally {
    await cleanup();
  }
});

test(
  "draft illustration renders with disclosure, stays out of formal build, then follows formal content and draft copy",
  { timeout: 120_000 },
  async () => {
    const { root, cleanup } = await workspace();
    const draftDir = join(root, "drafts/spots/illustrated-draft");
    const formalDir = join(root, "content/spots/approved-park");
    const data = parse(await readFile(join(formalDir, "spot.yaml"), "utf8"));
    data.name = "正式插畫測試公園";
    await writeFile(join(formalDir, "spot.yaml"), stringify(data));
    data.illustration = structuredClone(metadata);
    await mkdir(draftDir, { recursive: true });
    await writeFile(join(draftDir, "spot.yaml"), stringify(data));
    await writeFile(join(draftDir, "illustration.png"), png);
    const server = await devServer(root);
    const build = () =>
      execFileSync(process.execPath, ["scripts/site.mjs", "build"], {
        cwd: root,
        stdio: "pipe",
        timeout: 60_000,
      });
    try {
      const html = await server.waitFor(
        "/spots/illustrated-draft/",
        (html, status) =>
          status === 200 &&
          html.includes("/spot-illustrations/illustrated-draft.png"),
      );
      assert.match(html, /AI 生成情境插畫，非實際展區/);
      const response = await fetch(
        server.base + "/spot-illustrations/illustrated-draft.png",
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
      for (const url of [
        "/drafts/spots/illustrated-draft/illustration.png",
        `/@fs/${join(draftDir, "illustration.png")}`,
        "/spot-illustrations/unknown.png",
      ])
        assert.ok((await fetch(server.base + url)).status >= 400);
      await server.stop();
      build();
      await assert.rejects(
        readFile(join(root, "dist/spot-illustrations/illustrated-draft.png")),
        /ENOENT/,
      );
      await checkOutput(
        join(root, "dist"),
        join(root, "content/spots"),
        join(root, "tests/fixtures/spots"),
      );
      await writeFile(join(formalDir, "spot.yaml"), stringify(data));
      await writeFile(join(formalDir, "illustration.png"), png);
      build();
      assert.deepEqual(
        await readFile(join(root, "dist/spot-illustrations/approved-park.png")),
        png,
      );
      await checkOutput(
        join(root, "dist"),
        join(root, "content/spots"),
        join(root, "tests/fixtures/spots"),
      );
      await writeFile(join(root, "dist/spot-illustrations/orphan.png"), png);
      await assert.rejects(
        checkOutput(
          join(root, "dist"),
          join(root, "content/spots"),
          join(root, "tests/fixtures/spots"),
        ),
        /圖片資產/,
      );
      await rm(join(root, "dist/spot-illustrations/orphan.png"));
      await rm(join(root, "dist/spot-illustrations/approved-park.png"));
      await assert.rejects(
        checkOutput(
          join(root, "dist"),
          join(root, "content/spots"),
          join(root, "tests/fixtures/spots"),
        ),
        /ENOENT/,
      );
      execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "scripts/draft.ts",
          "copy",
          "approved-park",
        ],
        { cwd: root, stdio: "pipe" },
      );
      assert.deepEqual(
        await readFile(
          join(root, "drafts/spots/approved-park/illustration.png"),
        ),
        png,
      );
      assert.equal((await loadSpots(join(root, "drafts/spots"))).length, 2);
    } finally {
      await server.stop();
      await cleanup();
    }
  },
);

test("PNG validation rejects broken data and hidden text; import removes metadata", () => {
  const text = Buffer.from("Comment\0private research notes");
  const chunk = Buffer.alloc(text.length + 12);
  chunk.writeUInt32BE(text.length);
  chunk.write("tEXt", 4);
  text.copy(chunk, 8);
  chunk.writeUInt32BE(
    crc32(chunk.subarray(4, chunk.length - 4)),
    chunk.length - 4,
  );
  const hidden = Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
  assert.throws(() => normalizeIllustration(hidden), /PNG/);
  assert.deepEqual(normalizeIllustration(hidden, true), png);
  const badCRC = Buffer.from(png);
  badCRC[29] = badCRC[29]! ^ 1;
  assert.throws(() => normalizeIllustration(badCRC), /PNG/);
  const empty = Buffer.concat([png.subarray(0, 33), png.subarray(-12)]);
  assert.throws(() => normalizeIllustration(empty), /PNG/);
  const badPixels = Buffer.from(png);
  badPixels.writeUInt32BE(2, 16);
  badPixels.writeUInt32BE(crc32(badPixels.subarray(12, 29)), 29);
  assert.throws(() => normalizeIllustration(badPixels), /PNG/);
});

test("draft importer preserves source, removes text, and rejects appearance-changing normalization", async () => {
  const { root, cleanup } = await workspace();
  const directory = join(root, "drafts/spots/import-test");
  const source = join(root, "source.png");
  const chunk = (type: string, payload: Buffer) => {
    const result = Buffer.alloc(payload.length + 12);
    result.writeUInt32BE(payload.length);
    result.write(type, 4);
    payload.copy(result, 8);
    result.writeUInt32BE(
      crc32(result.subarray(4, result.length - 4)),
      result.length - 4,
    );
    return result;
  };
  const hidden = Buffer.concat([
    png.subarray(0, 33),
    chunk("tEXt", Buffer.from("Comment\0private notes")),
    png.subarray(33),
  ]);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "spot.yaml"),
      await readFile(join(root, "content/spots/approved-park/spot.yaml")),
    );
    await writeFile(source, hidden);
    const run = () =>
      execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "scripts/illustration.ts",
          "import-test",
          source,
          "虛構匯入插畫",
        ],
        { cwd: root, stdio: "pipe" },
      );
    run();
    assert.deepEqual(await readFile(source), hidden);
    assert.deepEqual(await readFile(join(directory, "illustration.png")), png);
    const before = await readFile(join(directory, "spot.yaml"));
    assert.equal(
      (await loadSpots(join(root, "drafts/spots")))[0]!.illustration!.alt,
      "虛構匯入插畫",
    );
    const rgbHeader = Buffer.from(png.subarray(16, 29));
    rgbHeader[9] = 2; // RGB: tRNS is valid and makes the red pixel transparent.
    const rgbPixels = chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0])));
    const rgb = Buffer.concat([
      png.subarray(0, 8),
      chunk("IHDR", rgbHeader),
      rgbPixels,
      png.subarray(-12),
    ]);
    assert.deepEqual(normalizeIllustration(rgb), rgb);
    const transparency = Buffer.concat([
      rgb.subarray(0, 33),
      chunk("tRNS", Buffer.from([0, 255, 0, 0, 0, 0])),
      rgb.subarray(33),
    ]);
    assert.throws(() => normalizeIllustration(transparency, true), /PNG/);
    await writeFile(source, transparency);
    assert.throws(run);
    assert.deepEqual(await readFile(join(directory, "spot.yaml")), before);
    assert.deepEqual(await readFile(join(directory, "illustration.png")), png);
  } finally {
    await cleanup();
  }
});
