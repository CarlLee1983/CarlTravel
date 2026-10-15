import { allSpots } from "./records.ts";

export async function matchIdentity(
  root: string,
  name: string,
  address: string,
  tourismId?: string,
) {
  const normalize = (text: string) => text.normalize("NFKC").trim();
  if (!name.trim() || !address.trim())
    throw new Error("同一性比對需要名稱與地址");
  const { formal, drafts } = await allSpots(root);
  const matches: {
    id: string;
    name: string;
    address: string;
    origin: string;
    reason: string;
    exact: boolean;
  }[] = [];
  for (const [origin, spots] of [
    ["formal", formal],
    ["draft", drafts],
  ] as const) {
    for (const spot of spots) {
      const sameName = normalize(name) === normalize(spot.name);
      const sameAddress = normalize(address) === normalize(spot.address);
      const sameTourism = !!tourismId && tourismId === spot.tourismId?.value;
      if (!sameName && !sameAddress && !sameTourism) continue;
      matches.push({
        id: spot.id,
        name: spot.name,
        address: spot.address,
        origin,
        exact: sameTourism || (sameName && sameAddress),
        reason: sameTourism
          ? "tourismId"
          : sameName && sameAddress
            ? "name+address"
            : sameName
              ? "name"
              : "address",
      });
    }
  }
  const exact = new Set(
    matches.filter((item) => item.exact).map((item) => item.id),
  );
  const unambiguous =
    exact.size === 1 && new Set(matches.map((item) => item.id)).size === 1;
  return {
    status: unambiguous ? "match" : matches.length ? "needs_decision" : "new",
    ...(unambiguous ? { id: [...exact][0]! } : {}),
    matches,
  };
}
