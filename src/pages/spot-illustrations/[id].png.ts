import type { APIRoute } from "astro";
import { join } from "node:path";
import { loadPageSpots, type PageSpot } from "../../content/preview.ts";
import { contentMode } from "../../content/mode.ts";
import { readIllustration } from "../../content/illustration.ts";

export async function getStaticPaths() {
  return (await loadPageSpots(__CARLTRAVEL_DRAFT_PREVIEW__))
    .filter((spot) => spot.illustration)
    .map((spot) => ({ params: { id: spot.id }, props: { spot } }));
}

export const GET: APIRoute = async ({ props }) => {
  const spot = props.spot as PageSpot;
  const root = spot.preview ? "drafts/spots" : contentMode().root;
  const bytes = await readIllustration(join(root, spot.id), spot.illustration!);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
};
