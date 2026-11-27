import type { ReactNode } from 'react';
import '@salmonui/core/styles.css';
// The stylesheets of the packages the routes render (the aggregates of the
// multi-family packages) and the sheets StockChart composes from others.
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/calendars/styles.css';
import '@salmonui/charts/styles.css';
import '@salmonui/data-grid/styles.css';
import '@salmonui/dropdowns/styles.css';
import '@salmonui/kanban/styles.css';
import '@salmonui/navigation/toolbar/styles.css';
import '@salmonui/notifications/styles.css';
import './app.css';

export const metadata = { title: 'Salmon UI Data Grid · Next.js App Router' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
