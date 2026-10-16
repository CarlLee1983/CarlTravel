import { parse, type DefaultTreeAdapterTypes as Tree } from "parse5";
import { outingSocialAlt, transportSectionTitle } from "../../src/site.ts";

export interface PublicCopySlots {
  social: boolean;
  imageAlt?: string;
  transport: boolean;
}

// Keep raw evidence intact except for exact values at their parsed source spans.
// Comments, scripts, duplicate attributes and parser-repaired markup get no exemption.
export function maskPublicCopy(html: string, slots?: PublicCopySlots): string {
  if (!slots) return html;
  let malformed = false;
  const document = parse(html, {
    sourceCodeLocationInfo: true,
    onParseError: () => {
      malformed = true;
    },
  });
  if (malformed) return html;
  const ranges: { start: number; end: number }[] = [];
  const used = new Set<string>();
  const attr = (node: Tree.Element, name: string) =>
    node.attrs.find((item) => item.name === name)?.value;
  const maskAttribute = (
    node: Tree.Element,
    name: string,
    value: string,
    slot: string,
  ) => {
    const location = node.sourceCodeLocation?.attrs?.[name];
    if (
      used.has(slot) ||
      !location ||
      attr(node, name) !== value ||
      html.slice(location.startOffset, location.endOffset) !==
        `${name}="${value}"`
    )
      return;
    ranges.push({
      start: location.startOffset + name.length + 2,
      end: location.endOffset - 1,
    });
    used.add(slot);
  };
  const maskText = (node: Tree.Element, slot: string) => {
    const child = node.childNodes[0];
    if (
      used.has(slot) ||
      node.childNodes.length !== 1 ||
      !child ||
      !("value" in child) ||
      child.value !== transportSectionTitle ||
      !child.sourceCodeLocation
    )
      return;
    const location = child.sourceCodeLocation;
    if (
      html.slice(location.startOffset, location.endOffset) !==
      transportSectionTitle
    )
      return;
    ranges.push({ start: location.startOffset, end: location.endOffset });
    used.add(slot);
  };
  const walk = (node: Tree.Node, ancestors: Tree.Element[]) => {
    if (!("tagName" in node)) {
      if ("childNodes" in node)
        for (const child of node.childNodes) walk(child, ancestors);
      return;
    }
    const parent = ancestors.at(-1);
    if (
      slots.social &&
      node.tagName === "meta" &&
      parent?.tagName === "head" &&
      attr(node, "property") === "og:image:alt"
    )
      maskAttribute(node, "content", outingSocialAlt, "social");
    if (
      slots.imageAlt &&
      node.tagName === "img" &&
      ancestors.some((item) => item.tagName === "body") &&
      attr(node, "src") === "/illustrations/family-outing.png"
    )
      maskAttribute(node, "alt", slots.imageAlt, "image");
    if (
      slots.transport &&
      node.tagName === "a" &&
      attr(node, "href") === "#transport" &&
      ancestors.some(
        (item) =>
          item.tagName === "nav" &&
          attr(item, "class")?.split(/\s+/).includes("contents"),
      )
    )
      maskText(node, "transport-link");
    if (
      slots.transport &&
      node.tagName === "h2" &&
      attr(node, "id") === "transport-heading" &&
      parent?.tagName === "section" &&
      attr(parent, "id") === "transport"
    )
      maskText(node, "transport-heading");
    for (const child of node.childNodes) walk(child, [...ancestors, node]);
  };
  walk(document, []);
  for (const { start, end } of ranges.sort((a, b) => b.start - a.start))
    html = html.slice(0, start) + html.slice(end);
  return html;
}
