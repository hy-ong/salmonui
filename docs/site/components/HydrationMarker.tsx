'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __hydrated?: boolean;
  }
}

/** Sets `window.__hydrated` after the root hydrates (read by the Playwright smoke suite). */
export function HydrationMarker() {
  useEffect(() => {
    window.__hydrated = true;
  }, []);
  return null;
}
