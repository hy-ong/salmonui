// Loaded with a dynamic import only when the hero's "Load 1,000,000 rows"
// button is clicked, so generating the large set
// is not part of the landing page's first load.
import { createHeroRows, type HeroRow } from './hero-data';

export const MILLION = 1_000_000;

export function createMillionRows(): HeroRow[] {
  return createHeroRows(MILLION);
}
