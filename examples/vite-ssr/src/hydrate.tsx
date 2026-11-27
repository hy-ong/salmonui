// Shared client bootstrap of every page: hydrate in StrictMode, report
// recoverable (hydration) errors to the console the browser specs watch, and
// set `window.__hydrated` on the next frame.
import { StrictMode, type ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';

declare global {
  interface Window {
    __hydrated?: boolean;
  }
}

export function hydrate(node: ReactNode): void {
  hydrateRoot(document.getElementById('root') as HTMLElement, <StrictMode>{node}</StrictMode>, {
    onRecoverableError(error) {
      console.error('[hydration] recoverable error', error);
    },
  });
  requestAnimationFrame(() => {
    window.__hydrated = true;
  });
}
