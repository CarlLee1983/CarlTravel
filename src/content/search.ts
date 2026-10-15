import type { SpotData } from "./schema.ts";

export const ageBandRanges = [
  { label: "0–2 歲", min: 0, max: 2 },
  { label: "3–6 歲", min: 3, max: 6 },
  { label: "7–12 歲", min: 7, max: 12 },
  { label: "13 歲以上", min: 13, max: Infinity },
] as const;

export function ageBands(age: SpotData["ageRange"]): string[] {
  if (age.status === "unknown") return ["年齡未標示"];
  return ageBandRanges
    .filter((band) => age.min <= band.max && (age.max ?? Infinity) >= band.min)
    .map((band) => band.label);
}
