// Server Component: a client grid whose props turn on a render feature
// (hydration fixture for tests/ssr/next-hydration.spec.ts).
import { ThemeStyle } from '@salmonui/core/server';
import { FeaturesGrid } from './features-grid';
import { theme } from '../theme';

export default function Page() {
  return (
    <>
      <ThemeStyle theme={theme} />
      <FeaturesGrid />
    </>
  );
}
