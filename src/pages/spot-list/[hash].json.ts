import type { APIRoute } from "astro";
import { buildList } from "../../content/list-build.ts";

export async function getStaticPaths() {
  const { hash, body } = await buildList();
  return [{ params: { hash }, props: { body } }];
}

export const GET: APIRoute = ({ props }) =>
  new Response(props.body as string, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
