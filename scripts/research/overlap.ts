function characters(text: string) {
  return [...text.normalize("NFKC").replace(/[\s\p{P}]/gu, "")];
}

export function overlap(original: string, text: string): string | null {
  const source = characters(original);
  const target = characters(text);
  const windows = new Set<string>();
  for (let i = 0; i <= source.length - 12; i++)
    windows.add(source.slice(i, i + 12).join(""));
  for (let i = 0; i <= target.length - 12; i++) {
    const window = target.slice(i, i + 12).join("");
    if (windows.has(window)) return window;
  }
  return null;
}
