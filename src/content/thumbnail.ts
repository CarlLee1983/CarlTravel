import sharp from "sharp";

export {
  thumbnailWidth,
  thumbnailHeight,
  thumbnailVersion,
  thumbnailUrl,
} from "./list-card.ts";
import { thumbnailWidth, thumbnailHeight } from "./list-card.ts";

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
