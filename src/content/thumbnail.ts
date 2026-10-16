import sharp from "sharp";

export const thumbnailWidth = 336;
export const thumbnailHeight = 224;
export const thumbnailVersion = "landscape-v2";
export const thumbnailUrl = (id: string) => `/spot-thumbnails/${id}.webp`;

// Call only with pixels returned by readIllustration; never accept paths or URLs.
// Match the landscape illustrations; cover avoids padded bands for other ratios.
// Sharp drops metadata by default. The reviewed original remains unchanged.
export async function renderThumbnail(validatedPng: Uint8Array) {
  return sharp(validatedPng)
    .resize({
      width: thumbnailWidth,
      height: thumbnailHeight,
      fit: "cover",
    })
    .webp({ quality: 76, effort: 4 })
    .toBuffer();
}
