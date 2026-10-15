import test from "node:test";
import assert from "node:assert/strict";
import { isStale, mapLinks } from "../src/content/presentation.ts";

test("stale warning begins after the twelve-month calendar anniversary", () => {
  assert.equal(isStale("2025-10-15", "2026-10-15"), false);
  assert.equal(isStale("2025-10-15", "2026-10-16"), true);
  assert.equal(isStale("2024-02-29", "2025-02-28"), false);
  assert.equal(isStale("2024-02-29", "2025-03-01"), true);
});

test("map links use coordinates when available and an encoded address otherwise", () => {
  assert.deepEqual(
    mapLinks("範例館", "臺北市中正區範例路一號", { lat: 25.03, lng: 121.52 }),
    {
      google: "https://www.google.com/maps/search/?api=1&query=25.03%2C121.52",
      osm: "https://www.openstreetmap.org/?mlat=25.03&mlon=121.52#map=16/25.03/121.52",
    },
  );
  const fallback = mapLinks("範例館", "臺北市中正區範例路一號");
  assert.equal(
    new URL(fallback.google).searchParams.get("query"),
    "範例館 臺北市中正區範例路一號",
  );
  assert.equal(
    new URL(fallback.osm).searchParams.get("query"),
    "範例館 臺北市中正區範例路一號",
  );
});
