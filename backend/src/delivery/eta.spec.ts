import { areaByKey } from './areas.js';
import { distanceKm, etaMinutes } from './eta.js';

describe('etaMinutes', () => {
  const yabaPharmacy = { lat: 6.503, lng: 3.378 };

  it('promises sooner for nearby drops, in 5-minute steps', () => {
    const near = etaMinutes(yabaPharmacy, areaByKey('yaba')!)!;
    const far = etaMinutes(yabaPharmacy, areaByKey('ajah')!)!;
    expect(near % 5).toBe(0);
    expect(near).toBeGreaterThanOrEqual(25); // packing + rider to pharmacy, at least
    expect(far).toBeGreaterThan(near + 30);
  });

  it('can’t estimate without the pharmacy’s location', () => {
    expect(etaMinutes({ lat: null, lng: null }, areaByKey('yaba')!)).toBeNull();
  });
});

describe('distanceKm', () => {
  it('is roughly right across Lagos', () => {
    const km = distanceKm(areaByKey('ikeja')!, areaByKey('victoria-island')!);
    expect(km).toBeGreaterThan(15);
    expect(km).toBeLessThan(25);
  });
});
