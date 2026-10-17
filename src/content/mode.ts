export function contentMode() {
  const value = process.env.CARLTRAVEL_FIXTURE;
  if (value !== undefined && value !== "1")
    throw new Error("CARLTRAVEL_FIXTURE must be unset or 1");
  const fixture = value === "1";
  // fixture 建置的內容根目錄由 scripts/site.mjs 組在暫存目錄；只在 fixture 模式有效
  const fixtureRoot = process.env.CARLTRAVEL_FIXTURE_ROOT;
  if (fixtureRoot && !fixture)
    throw new Error("CARLTRAVEL_FIXTURE_ROOT requires CARLTRAVEL_FIXTURE=1");
  return {
    fixture,
    root: fixture ? fixtureRoot || "tests/fixtures/spots" : "content/spots",
    outDir: fixture ? "dist-fixture" : "dist",
  };
}
