'use client';

import { useRouter } from 'next/navigation';
import { isDocumentOnlyPath } from '../lib/document-only.mjs';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import {
  prepareRecords,
  searchIndex,
  searchShardUrl,
  SEARCH_INDEX_VERSION,
  SEARCH_MANIFEST_URL,
  type PreparedRecord,
  type SearchKind,
  type SearchManifest,
  type SearchRecord,
  type SearchShard,
} from '../lib/search';

const KIND_LABEL: Record<SearchKind, string> = {
  section: 'Docs',
  symbol: 'API',
  demo: 'Demo',
};

type LoadState = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; manifest: SearchManifest };

/** Shards fetched so far: `pending` in flight, `failed` retried on the next open. */
type ShardState = { pending: number; failed: number };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

/** An open or close request from `SearchButton`; a new object (new `id`) per request. */
export type SearchRequest = {
  id: number;
  action: 'open' | 'close';
  /** Query to prefill on open (`?q=`); omitted keeps the current query. */
  prefill?: string | undefined;
  /** Element to refocus when the dialog closes (the focused element at the request). */
  returnFocus?: HTMLElement | null | undefined;
};

/**
 * The search dialog, loaded by `SearchButton` with a
 * dynamic `import()` on the first open, so no page ships it on load. The
 * manifest (page titles, top symbols, the shard list) is fetched on first
 * open; the first non-empty query fetches every shard in parallel, and
 * results re-rank as each one arrives. Everything fetched is kept for the
 * tab (the button lives in the root layout, so client navigation keeps
 * this component and its records). The dialog is a modal `<dialog>` with
 * a combobox input and a listbox of results.
 */
export function SearchDialog({ request, onOpenChange }: { request: SearchRequest; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const baseId = useId();
  const listboxId = `${baseId}-results`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const loadingRef = useRef<Promise<void> | null>(null);
  /** Shard id -> loading or loaded; a failed shard is removed so the next open retries it. */
  const shardsRef = useRef(new Map<string, 'loading' | 'loaded'>());
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [load, setLoad] = useState<LoadState>({ status: 'idle' });
  const [records, setRecords] = useState<PreparedRecord[]>([]);
  const [shards, setShards] = useState<ShardState>({ pending: 0, failed: 0 });

  const ensureIndex = useCallback(() => {
    if (loadingRef.current) return;
    setLoad({ status: 'loading' });
    loadingRef.current = fetchJson<SearchManifest>(SEARCH_MANIFEST_URL)
      .then((manifest) => {
        if (manifest.version !== SEARCH_INDEX_VERSION) throw new Error(`search index version ${String(manifest.version)}`);
        setRecords((current) => [...prepareRecords(manifest.records, 0), ...current]);
        setLoad({ status: 'ready', manifest });
      })
      .catch(() => {
        loadingRef.current = null;
        setLoad({ status: 'error' });
      });
  }, []);

  /** Fetches every shard not loaded or loading yet, in parallel (the first non-empty query). */
  const ensureShards = useCallback((manifest: SearchManifest) => {
    const wanted = manifest.shards.map((info, position) => ({ info, source: position + 1 })).filter(({ info }) => !shardsRef.current.has(info.id));
    if (wanted.length === 0) return;
    setShards((current) => ({ pending: current.pending + wanted.length, failed: 0 }));
    for (const { info, source } of wanted) {
      shardsRef.current.set(info.id, 'loading');
      fetchJson<SearchShard>(searchShardUrl(info.id))
        .then((shard) => {
          if (shard.version !== SEARCH_INDEX_VERSION || shard.id !== info.id) throw new Error(`search shard ${info.id}`);
          shardsRef.current.set(info.id, 'loaded');
          setRecords((current) => [...current, ...prepareRecords(shard.records, source)]);
          setShards((current) => ({ ...current, pending: current.pending - 1 }));
        })
        .catch(() => {
          shardsRef.current.delete(info.id);
          setShards((current) => ({ pending: current.pending - 1, failed: current.failed + 1 }));
        });
    }
  }, []);

  const openDialog = useCallback(
    (prefill: string | undefined, returnFocus: HTMLElement | null) => {
      returnFocusRef.current = returnFocus;
      if (prefill !== undefined) {
        setQuery(prefill);
        setActive(0);
      }
      setOpen(true);
      ensureIndex();
    },
    [ensureIndex],
  );

  const closeDialog = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else setOpen(false);
  }, []);

  // The native dialog's `close` event (Escape, `close()`) is the one place
  // that ends the open state and restores focus.
  const onClose = useCallback(() => {
    setOpen(false);
    onOpenChange(false);
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) target.focus();
  }, [onOpenChange]);

  useEffect(() => {
    if (request.action === 'close') closeDialog();
    else {
      openDialog(request.prefill, request.returnFocus ?? null);
      onOpenChange(true);
    }
  }, [request, openDialog, closeDialog, onOpenChange]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open]);

  // The manifest answers at once; the first non-empty query pulls in the
  // shards. Reopening with a query retries any shard that failed.
  const hasQuery = query.trim() !== '';
  useEffect(() => {
    if (open && hasQuery && load.status === 'ready') ensureShards(load.manifest);
  }, [open, hasQuery, load, ensureShards]);

  const results: SearchRecord[] = useMemo(() => (load.status === 'ready' ? searchIndex(records, query) : []), [load.status, records, query]);
  const activeIndex = results.length === 0 ? -1 : Math.min(active, results.length - 1);

  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${baseId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, baseId]);

  const go = (record: SearchRecord | undefined) => {
    if (!record) return;
    returnFocusRef.current = null;
    closeDialog();
    // Document-only pages have no RSC payload in the export: load them as documents.
    if (isDocumentOnlyPath(record.url)) window.location.assign(record.url);
    else router.push(record.url);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[activeIndex]);
    }
  };

  const onDialogClick = (event: MouseEvent<HTMLDialogElement>) => {
    // A click on the backdrop targets the dialog element itself.
    if (event.target === event.currentTarget) closeDialog();
  };

  const trimmed = query.trim();
  let status = '';
  if (load.status === 'loading') status = 'Loading the search index…';
  else if (load.status === 'error') status = 'The search index could not be loaded.';
  else if (load.status === 'ready' && trimmed !== '') {
    if (results.length === 0) status = shards.pending > 0 ? 'Searching…' : `No results for “${trimmed}”`;
    else status = `${results.length} ${results.length === 1 ? 'result' : 'results'}${shards.pending > 0 ? ', searching…' : ''}`;
    if (shards.pending === 0 && shards.failed > 0) status += ' Some of the index could not be loaded.';
  }

  return (
    <dialog ref={dialogRef} className="site-search__dialog" aria-label="Search the docs" onClose={onClose} onClick={onDialogClick}>
      {open ? (
        <div className="site-search__panel">
          <div className="site-search__field">
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label="Search the docs"
              aria-autocomplete="list"
              aria-expanded={results.length > 0}
              aria-controls={listboxId}
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
              autoComplete="off"
              spellCheck={false}
              placeholder="Search docs, API, demos"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
            />
            <button type="button" className="site-search__close" onClick={closeDialog}>
              Esc
            </button>
          </div>
          <ul id={listboxId} role="listbox" aria-label="Search results" className="site-search__results">
            {results.map((record, index) => (
              <li
                key={`${record.kind}:${record.url}:${record.title}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                className="site-search__result"
                data-kind={record.kind}
                onMouseMove={() => {
                  if (index !== activeIndex) setActive(index);
                }}
                onClick={() => go(record)}
              >
                <span className="site-search__kind">{KIND_LABEL[record.kind]}</span>
                <span className="site-search__title">{record.title}</span>
                {record.section ? <span className="site-search__section">{record.section}</span> : null}
                {record.text ? <span className="site-search__text">{record.text}</span> : null}
              </li>
            ))}
          </ul>
          <p className="site-search__status" role="status">
            {status}
          </p>
        </div>
      ) : null}
    </dialog>
  );
}
