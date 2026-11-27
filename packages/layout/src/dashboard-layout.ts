'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/layout/dashboard-layout`: DashboardLayout and DashboardLayoutPanel.
// Render-safe: the server render
// has the final grid placement; pointer and keyboard moves start after
// hydration.
export { DashboardLayout, DashboardLayoutPanel } from './dashboard-layout/DashboardLayout.js';
export type { DashboardLayoutProps, DashboardLayoutPanelProps, DashboardLayoutItem, DashboardResizeEdge, DashboardLayoutLocaleText } from './dashboard-layout/DashboardLayout.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/layout/dashboard-layout', 'salmon-dashboard');
