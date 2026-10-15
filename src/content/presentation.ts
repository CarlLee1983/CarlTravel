export function isStale(checkedAt: string, buildDate: string): boolean {
  const [year, month, day] = checkedAt.split("-").map(Number);
  const anniversaryYear = year! + 1;
  const lastDay = new Date(Date.UTC(anniversaryYear, month!, 0)).getUTCDate();
  const anniversary = `${anniversaryYear}-${String(month).padStart(2, "0")}-${String(Math.min(day!, lastDay)).padStart(2, "0")}`;
  return buildDate > anniversary;
}

export function mapLinks(
  name: string,
  address: string,
  location?: { lat: number; lng: number },
): { google: string; osm: string } {
  if (location) {
    const { lat, lng } = location;
    return {
      google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`,
      osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`,
    };
  }
  const query = encodeURIComponent(`${name} ${address}`);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${query}`,
    osm: `https://www.openstreetmap.org/search?query=${query}`,
  };
}
