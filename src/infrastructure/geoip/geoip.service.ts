
import maxmind, { type CityResponse, type Reader } from 'maxmind';
import path from 'node:path';

// Locate the database file from the project root.
const databasePath = path.resolve(
  process.cwd(),
  'data',
  'GeoLite2-City.mmdb'
);

// Keep one database reader for this Node.js process.
let cityLookupPromise: Promise<Reader<CityResponse>> | undefined;

function getCityLookup(): Promise<Reader<CityResponse>> {
  if (!cityLookupPromise) {
    cityLookupPromise = maxmind.open<CityResponse>(databasePath);
  }

  return cityLookupPromise;
}

// Look up an IP address in the local GeoIP database.
export async function lookupIp(ip: string) {
  if (!maxmind.validate(ip)) {
    return null;
  }

  const cityLookup = await getCityLookup();

  return cityLookup.get(ip);
}
