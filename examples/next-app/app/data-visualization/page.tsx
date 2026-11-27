// Data Visualization in the Next App Router (one page per category). Server
// Component; the Kanban board is a
// client island (its accessors are functions, so it lives behind a "use client"
// boundary). tests/ssr/next-data-visualization.spec.ts asserts the server HTML
// and hydration.
import { ThemeStyle } from '@salmonui/core/server';
import { theme } from '../theme';
import { KanbanBoard } from './kanban-board';
import { VizGallery } from './viz-gallery';

export const metadata = { title: 'Salmon UI Data Visualization · Next.js App Router' };

export default function DataVisualizationPage() {
  return (
    <>
      <ThemeStyle theme={theme} />
      <main style={{ padding: 16 }}>
        <VizGallery />
        <KanbanBoard />
      </main>
    </>
  );
}
