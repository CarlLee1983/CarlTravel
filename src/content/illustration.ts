import { createHash } from "node:crypto";
import { crc32, inflateSync } from "node:zlib";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import type { SpotData } from "./schema.ts";

export const illustrationFilename = "illustration.png";
export const illustrationCaption = "AI 生成情境插畫，非實際展區";
export const illustrationUrl = (id: string) => `/spot-illustrations/${id}.png`;

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Support non-interlaced 8-bit grayscale/RGB PNGs, with optional alpha.
// Only pixel-bearing chunks enter public content; source metadata stays local.
export function normalizeIllustration(
  bytes: Uint8Array,
  stripMetadata = false,
) {
  const data = Buffer.from(bytes);
  const fail = () => {
    throw new Error("PNG 格式、像素資料或中繼資料不符合插畫規則");
  };
  if (data.length > 8 * 1024 * 1024 || !data.subarray(0, 8).equals(signature))
    fail();
  const chunks: Buffer[] = [];
  const pixels: Buffer[] = [];
  let width = 0,
    height = 0,
    channels = 0,
    ended = false,
    imageEnded = false;
  for (let offset = 8; offset < data.length;) {
    if (offset + 12 > data.length) fail();
    const length = data.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > data.length) fail();
    const type = data.toString("ascii", offset + 4, offset + 8);
    if (
      crc32(data.subarray(offset + 4, end - 4)) !== data.readUInt32BE(end - 4)
    )
      fail();
    if (offset === 8 && type !== "IHDR") fail();
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) fail();
      width = data.readUInt32BE(offset + 8);
      height = data.readUInt32BE(offset + 12);
      channels =
        ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[
          data[offset + 17]!
        ] ?? 0;
      if (
        !width ||
        !height ||
        width > 4096 ||
        height > 4096 ||
        !channels ||
        data[offset + 16] !== 8 ||
        data[offset + 18] !== 0 ||
        data[offset + 19] !== 0 ||
        data[offset + 20] !== 0
      )
        fail();
    } else if (type === "IDAT") {
      if (imageEnded) fail();
      pixels.push(data.subarray(offset + 8, end - 4));
    } else if (type === "IEND") {
      if (length || !pixels.length || end !== data.length) fail();
      ended = true;
    } else {
      if (pixels.length) imageEnded = true;
      // Transparency, color profiles and unknown chunks may affect appearance.
      // Discard only known nonvisual text/provenance/time metadata.
      if (
        !stripMetadata ||
        !["tEXt", "zTXt", "iTXt", "caBX", "tIME"].includes(type)
      )
        fail();
      offset = end;
      continue;
    }
    chunks.push(data.subarray(offset, end));
    offset = end;
  }
  if (!ended) fail();
  const compressed = Buffer.concat(pixels);
  const stride = width * channels + 1;
  // Node returns both fields with info:true; @types/node 22 only declares the Buffer overload.
  const inflated = inflateSync(compressed, {
    maxOutputLength: stride * height,
    info: true,
  }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
  if (
    inflated.buffer.length !== stride * height ||
    inflated.engine.bytesWritten !== compressed.length
  )
    fail();
  for (let offset = 0; offset < inflated.buffer.length; offset += stride)
    if (inflated.buffer[offset]! > 4) fail();
  return Buffer.concat([signature, ...chunks]);
}

export function validateIllustration(
  bytes: Uint8Array,
  meta: NonNullable<SpotData["illustration"]>,
) {
  const data = normalizeIllustration(bytes);
  if (
    data.readUInt32BE(16) !== meta.width ||
    data.readUInt32BE(20) !== meta.height ||
    createHash("sha256").update(data).digest("hex") !== meta.sha256
  )
    throw new Error("插畫必須是尺寸與 SHA256 相符的 PNG");
  return data;
}

export async function readIllustration(
  directory: string,
  meta: NonNullable<SpotData["illustration"]>,
) {
  const file = await open(
    join(directory, illustrationFilename),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024)
      throw new Error("插畫必須是 8 MiB 內的一般檔案");
    return validateIllustration(await file.readFile(), meta);
  } finally {
    await file.close();
  }
}
