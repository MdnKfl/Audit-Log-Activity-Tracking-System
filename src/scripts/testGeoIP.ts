
import { lookupIp } from '../infrastructure/geoip/geoip.service.js';

async function testGeoIP() {
  const testIp = '8.8.8.8';

  console.log(`Looking up IP: ${testIp}`);

  try {
    const result = await lookupIp(testIp);

    if (!result) {
      console.log('No location found for this IP.');
      return;
    }

    console.log('GeoIP lookup successful!');
    console.dir(result, { depth: null });
  } catch (error) {
    console.error('GeoIP lookup failed:', error);
  }
}

testGeoIP();
