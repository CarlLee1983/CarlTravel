import type { APIRoute } from "astro";
import { loadBuildSpots } from "../content/build-spots.ts";
import { contentMode } from "../content/mode.ts";
import { siteUrl } from "../site.ts";

export const GET: APIRoute = async () => {
  const { fixture, root } = contentMode();
  // Only formal content can enter discovery, even when previewing test pages.
  const paths = fixture
    ? []
    : [
        "/",
        "/about/",
        ...(await loadBuildSpots(root)).map((spot) => `/spots/${spot.id}/`),
      ];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${siteUrl}${path}</loc></url>`).join("")}</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
