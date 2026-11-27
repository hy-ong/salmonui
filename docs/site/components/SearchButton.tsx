'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import type { SearchRequest } from './Search';

type SearchDialogComponent = ComponentType<{ request: SearchRequest; onOpenChange: (open: boolean) => void }>;

/**
 * Search button and Cmd/Ctrl-K shortcut. Only this
 * small component ships with every page: the dialog (`./Search`, with the
 * matcher in `lib/search`) is fetched by a dynamic `import()` on the first
 * click, Cmd/Ctrl-K or `?q=`, and stays mounted afterwards. `/docs?q=sort`
 * (the WebSite SearchAction target) opens it prefilled after hydration.
 */
export function SearchButton() {
  const [Dialog, setDialog] = useState<SearchDialogComponent | null>(null);
  const [request, setRequest] = useState<SearchRequest | null>(null);
  // Server markup and the first client render use the same label; the macOS
  // label is applied after hydration.
  const [shortcut, setShortcut] = useState('Ctrl K');
  const openRef = useRef(false);
  const loadingRef = useRef<Promise<void> | null>(null);
  const nextIdRef = useRef(1);

  const send = useCallback((action: SearchRequest['action'], prefill?: string) => {
    const focused = document.activeElement;
    const returnFocus = focused instanceof HTMLElement && focused !== document.body ? focused : null;
    const id = nextIdRef.current++;
    setRequest({ id, action, prefill, returnFocus });
    if (action === 'open' && !loadingRef.current) {
      loadingRef.current = import('./Search')
        .then((module) => setDialog(() => module.SearchDialog))
        .catch(() => {
          // A failed chunk load leaves the button usable for another try.
          loadingRef.current = null;
        });
    }
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    openRef.current = open;
  }, []);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setShortcut('⌘K');
    const onKeyDown = (event: KeyboardEvent) => {
      // An editor on the page that handled Mod+K itself (a link dialog) keeps it.
      if (event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        send(openRef.current ? 'close' : 'open');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const prefill = new URLSearchParams(window.location.search).get('q');
    if (prefill !== null && prefill.trim() !== '') send('open', prefill);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [send]);

  return (
    <>
      <button type="button" className="site-search__button" aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K" onClick={() => send('open')}>
        <span>Search</span>
        <kbd>{shortcut}</kbd>
      </button>
      {Dialog && request ? <Dialog request={request} onOpenChange={onOpenChange} /> : null}
    </>
  );
}
