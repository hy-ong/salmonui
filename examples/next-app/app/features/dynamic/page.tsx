// `/features` rendered per request (streaming SSR under `next start` too, not prerendered): the grid with a
// render feature must stream as plain markup, never as an outlined boundary with a placeholder.
import { ThemeStyle } from '@salmonui/core/server';
import { FeaturesGrid } from '../features-grid';
import { theme } from '../../theme';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <>
      <ThemeStyle theme={theme} />
      <FeaturesGrid />
    </>
  );
}
