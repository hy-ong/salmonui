// Toolbar icons (decorative; the buttons carry the accessible names).
import type { ReactElement } from 'react';

const icon = (d: string): ReactElement => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={d} />
  </svg>
);

type IconName = 'sidebar' | 'previous' | 'next' | 'zoomIn' | 'zoomOut' | 'search' | 'highlight' | 'underline' | 'strikethrough' | 'print' | 'download' | 'close';

export const ICONS: Readonly<Record<IconName, ReactElement>> = {
  sidebar: icon('M2.5 3h11v10h-11zM6 3v10'),
  previous: icon('M4 10l4-4 4 4'),
  next: icon('M4 6l4 4 4-4'),
  zoomIn: icon('M7 3.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7zM9.6 9.6L13 13M5.5 7h3M7 5.5v3'),
  zoomOut: icon('M7 3.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7zM9.6 9.6L13 13M5.5 7h3'),
  search: icon('M7 3a4 4 0 1 1 0 8a4 4 0 0 1 0-8zM10 10l3.5 3.5'),
  highlight: icon('M3 13h10M5 10l5.5-6.5 2 2L7 12H5z'),
  underline: icon('M5 3v4.5a3 3 0 0 0 6 0V3M4 13.5h8'),
  strikethrough: icon('M3 8h10M10.5 5C10 4 9 3.5 8 3.5c-1.5 0-2.5.8-2.5 2M5.5 11c.5 1 1.5 1.5 2.5 1.5 1.5 0 2.5-.8 2.5-2'),
  print: icon('M4.5 6V2.5h7V6M4.5 11.5H3V6h10v5.5h-1.5M4.5 9.5h7v4h-7z'),
  download: icon('M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10'),
  close: icon('M4 4l8 8M12 4l-8 8'),
};
