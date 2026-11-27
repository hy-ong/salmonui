'use client';

// The overlay slot of the default DataGrid bundle (menus, filter menu,
// column chooser, toolbar overflow): the overlay code itself (overlays.tsx,
// popover.tsx) is a lazy chunk. It is
// preloaded after mount when a prop can open an overlay and loaded on the
// first open otherwise. Overlays never render on the server, so the slot is
// empty for the server render and hydration.

import { useEffect, useSyncExternalStore } from 'react';
import { useDataGridInstance } from './context.js';
import type { DataGridInstance } from './instance.js';
import { filteringOf } from './query-config.js';

type OverlayChunk = typeof import('./overlays.js');

// One load per page (a load cache, not render state).
let chunkLoad: Promise<OverlayChunk> | null = null;
let loadedChunk: OverlayChunk | null = null;
const listeners = new Set<() => void>();

function loadOverlayChunk(): Promise<OverlayChunk> {
  return (chunkLoad ??= import('./overlays.js').then((chunk) => {
    loadedChunk = chunk;
    for (const l of listeners) l();
    return chunk;
  }));
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getChunk = (): OverlayChunk | null => loadedChunk;
// The filter builder chunk, loaded by the overlay chunk.
const loadFilterBuilder = () => import('./filter-builder.js');
const getServerChunk = (): OverlayChunk | null => null;

/** A prop of the grid can open an overlay. */
function hasOverlays(instance: DataGridInstance<unknown>): boolean {
  const p = instance.props;
  return Boolean(p.columnMenu || p.contextMenu || p.columnChooser || p.toolbar?.length || p.renderToolbar || p.filtering);
}

/** Renders the open overlay of the enclosing DataGrid (nothing on the server or while closed). */
export function DataGridOverlays() {
  const instance = useDataGridInstance<unknown>();
  const chrome = instance.chrome;
  const overlay = useSyncExternalStore(chrome.subscribe, chrome.getOverlay, chrome.getServerOverlay);
  const chunk = useSyncExternalStore(subscribe, getChunk, getServerChunk);
  // Touch multi-sort popup: part of the overlay chunk, independent of the open overlay.
  const touchSort = useSyncExternalStore(chrome.subscribe, chrome.getTouchSort, chrome.getServerOverlay as () => null);
  const wanted = overlay !== null || touchSort !== null || hasOverlays(instance);
  // `filtering.builder` also preloads the filter builder chunk.
  const builder = Boolean(filteringOf(instance.props)?.builder);
  useEffect(() => {
    if (wanted) void loadOverlayChunk().then((c) => (builder ? c.preloadFilterBuilder(loadFilterBuilder) : undefined)).catch(() => undefined);
  }, [wanted, builder]);
  if (!chunk) return null;
  return (
    <>
      {overlay ? <chunk.OverlayContent instance={instance} overlay={overlay} loadBuilder={loadFilterBuilder} /> : null}
      {touchSort ? <chunk.TouchSortPopup instance={instance} state={touchSort} /> : null}
    </>
  );
}
