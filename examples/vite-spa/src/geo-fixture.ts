// A hand-written GeoJSON fixture for GeoMap tests and demos: nine invented
// "regions" on a 3 x 3 grid of 10-degree cells (no third-party geo data),
// plus a planar seat map.
import type { GeoFeatureCollection } from '@salmonui/charts/geo-map';

const NAMES = ['Northwest', 'North', 'Northeast', 'West', 'Central', 'East', 'Southwest', 'South', 'Southeast'];

export const REGIONS: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: NAMES.map((name, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const lon0 = -10 + col * 10;
    const lat1 = 60 - row * 10;
    // A notch keeps the shapes from being plain rectangles.
    const ring = [[lon0, lat1], [lon0 + 10, lat1], [lon0 + 10, lat1 - 10], [lon0 + 5, lat1 - 8], [lon0, lat1 - 10], [lon0, lat1]];
    return { type: 'Feature', id: `r${i}`, properties: { name, code: `R${i + 1}` }, geometry: { type: 'Polygon', coordinates: [ring] } };
  }),
};

export const POPULATION = NAMES.map((name, i) => ({ region: name, population: [12, 30, 8, 45, 60, 22, 5, 18, 40][i]!, status: i % 3 === 0 ? 'low' : i % 3 === 1 ? 'mid' : 'high' }));

export const CITIES = [
  { name: 'Alpha', latitude: 55, longitude: -4 },
  { name: 'Beta', latitude: 54.6, longitude: -3.2 },
  { name: 'Gamma', latitude: 45, longitude: 6 },
  { name: 'Delta', latitude: 36, longitude: 14 },
  { name: 'Epsilon', latitude: 51, longitude: 12 },
];

export const SEATS: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: Array.from({ length: 12 }, (_, i) => {
    const x = (i % 6) * 12;
    const y = Math.floor(i / 6) * 12;
    return { type: 'Feature', properties: { name: `Seat ${String.fromCharCode(65 + Math.floor(i / 6))}${(i % 6) + 1}` }, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10], [x, y]]] } };
  }),
};
