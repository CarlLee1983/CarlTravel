export function contentMode() {
  const value = process.env.CARLTRAVEL_FIXTURE;
  if (value !== undefined && value !== "1")
    throw new Error("CARLTRAVEL_FIXTURE must be unset or 1");
  const fixture = value === "1";
  return {
    fixture,
    root: fixture ? "tests/fixtures/spots" : "content/spots",
    outDir: fixture ? "dist-fixture" : "dist",
  };
}
