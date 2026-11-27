// PdfViewer toolbar on the shared Toolbar: one tab stop,
// roving arrow keys, overflow into a menu below the container width; and
// the find bar.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@salmonui/buttons/button';
import { MenuButton } from '@salmonui/buttons/menu';
import { Toolbar, ToolbarItem, ToolbarSeparator, ToolbarSpacer } from '@salmonui/navigation/toolbar';
import type { CoreSnapshot, ViewerCore } from './core.js';
import { ICONS } from './icons.js';
import { fill, type PdfViewerLocaleText } from './locale.js';
import type { PdfViewerProps, PdfViewerToolbarItem, PdfViewerZoom } from './types.js';
import { formatScale, ZOOM_STEPS } from './zoom.js';

export const DEFAULT_TOOLBAR: readonly PdfViewerToolbarItem[] = Object.freeze([
  'sidebar',
  '|',
  'previous',
  'next',
  'pageNumber',
  '|',
  'zoomOut',
  'zoom',
  'zoomIn',
  '-',
  'search',
  'highlight',
  'underline',
  'strikethrough',
  '|',
  'print',
  'download',
] as const);

interface Ctx {
  readonly core: ViewerCore;
  readonly snap: CoreSnapshot;
  readonly t: PdfViewerLocaleText;
}

function PageNumber({ core, snap, t }: Ctx) {
  const [draft, setDraft] = useState<string | null>(null);
  const count = snap.sizes.length;
  const commit = () => {
    if (draft === null) return;
    const n = Number.parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(n)) core.goToPage(n - 1, 'toolbar');
  };
  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        aria-label={t.pageNumber}
        size={3}
        value={draft ?? (count ? String(snap.page + 1) : '')}
        disabled={!count}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') setDraft(null);
        }}
      />
      <span className="salmon-pdf-viewer__page-count">{fill(t.pageOf, { count })}</span>
    </>
  );
}

const zoomItems = (t: PdfViewerLocaleText) => [
  { id: 'auto', label: t.zoomAuto },
  { id: 'page-fit', label: t.zoomPageFit },
  { id: 'page-width', label: t.zoomPageWidth },
  { type: 'separator' as const },
  ...ZOOM_STEPS.map((s) => ({ id: String(s), label: formatScale(s) })),
];

function builtIn(id: string, { core, snap, t }: Ctx): ReactNode {
  const ready = snap.status === 'ready';
  const count = snap.sizes.length;
  const btn = (key: string, label: string, icon: ReactNode, onClick: () => void, extra: Record<string, unknown> = {}) => (
    <Button key={key} data-item-id={key} variant="ghost" iconOnly aria-label={label} title={label} onClick={onClick} {...extra}>
      {icon}
    </Button>
  );
  switch (id) {
    case 'sidebar':
      return btn('sidebar', t.sidebar, ICONS.sidebar, () => core.setSidebar(snap.sidebar ? null : 'thumbnails'), { 'aria-pressed': !!snap.sidebar, disabled: !count });
    case 'previous':
      return btn('previous', t.previous, ICONS.previous, () => core.stepPage(-1, 'toolbar'), { disabled: !ready || snap.page <= 0 });
    case 'next':
      return btn('next', t.next, ICONS.next, () => core.stepPage(1, 'toolbar'), { disabled: !ready || snap.page >= count - 1 });
    case 'pageNumber':
      return (
        <ToolbarItem key="pageNumber" label={t.pageNumber} className="salmon-pdf-viewer__page-number" overflow="never">
          <PageNumber core={core} snap={snap} t={t} />
        </ToolbarItem>
      );
    case 'zoomOut':
      return btn('zoomOut', t.zoomOut, ICONS.zoomOut, () => core.zoomBy(-1, 'toolbar'), { disabled: snap.scale <= 0.1 });
    case 'zoomIn':
      return btn('zoomIn', t.zoomIn, ICONS.zoomIn, () => core.zoomBy(1, 'toolbar'), { disabled: snap.scale >= 10 });
    case 'zoom':
      return (
        <ToolbarItem key="zoom" label={t.zoom} overflow="never">
          <MenuButton
            data-item-id="zoom"
            variant="ghost"
            aria-label={`${t.zoom}: ${formatScale(snap.scale)}`}
            items={zoomItems(t)}
            onAction={(event) => {
              const v = Number(event.id);
              core.setZoom((Number.isFinite(v) ? v : event.id) as PdfViewerZoom, 'toolbar');
            }}
          >
            {formatScale(snap.scale)}
          </MenuButton>
        </ToolbarItem>
      );
    case 'search':
      return btn('search', t.search, ICONS.search, () => core.openFind(!snap.findOpen), { 'aria-expanded': snap.findOpen, disabled: !ready });
    case 'highlight':
    case 'underline':
    case 'strikethrough':
      // Pressing keeps the text selection (no focus move on mouse down).
      return btn(id, t[id], ICONS[id], () => core.addTextMarkup(id), { disabled: !ready || !snap.hasSelection, onMouseDown: (e: MouseEvent) => e.preventDefault() });
    case 'print':
      return btn('print', t.print, ICONS.print, () => void core.print(), { disabled: !ready });
    case 'download':
      return btn('download', t.download, ICONS.download, () => void core.download(), { disabled: !ready });
    default:
      return null;
  }
}

export function ViewerToolbar({ core, snap, t, props }: Ctx & { readonly props: PdfViewerProps }) {
  const list = props.toolbar === false ? [] : (props.toolbar ?? DEFAULT_TOOLBAR);
  const items = list.map((item, i) => {
    if (item === '|') return <ToolbarSeparator key={`sep-${i}`} />;
    if (item === '-') return <ToolbarSpacer key={`spacer-${i}`} />;
    if (typeof item === 'string') return builtIn(item, { core, snap, t });
    if (item.render) return <ToolbarItem key={item.id} label={item.label}>{item.render(core.actions)}</ToolbarItem>;
    const onClick = () => item.onSelect?.(core.actions);
    return item.icon ? (
      <Button key={item.id} data-item-id={item.id} variant="ghost" disabled={item.disabled} iconOnly aria-label={item.label} title={item.label} onClick={onClick}>
        {item.icon}
      </Button>
    ) : (
      <Button key={item.id} data-item-id={item.id} variant="ghost" disabled={item.disabled} title={item.label} onClick={onClick}>
        {item.label}
      </Button>
    );
  });
  if (props.renderToolbar) return <>{props.renderToolbar({ items, actions: core.actions, state: core.actions.getState() })}</>;
  return (
    <Toolbar aria-label={t.toolbar} className={['salmon-pdf-viewer__toolbar', props.classNames?.toolbar].filter(Boolean).join(' ')} style={props.styles?.toolbar} localeText={{ more: t.more }}>
      {items}
    </Toolbar>
  );
}

export function FindBar({ core, snap, t, className, style }: Ctx & { readonly className?: string | undefined; readonly style?: CSSProperties | undefined }) {
  const { find } = snap;
  const status = !find.query.trim() ? '' : snap.searching ? '…' : snap.matchTotal ? fill(t.matchCount, { current: snap.matchIndex + 1, total: snap.matchTotal }) : t.noMatches;
  const toggle = (key: 'matchCase' | 'wholeWord' | 'highlightAll', label: string) => (
    <label className="salmon-pdf-viewer__find-option">
      <input type="checkbox" checked={find[key]} onChange={(e) => core.setFindOption({ [key]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
  return (
    <div className={['salmon-pdf-viewer__find', className].filter(Boolean).join(' ')} style={style} role="search" aria-label={t.findLabel}>
      <input
        ref={(el) => core.setFindInput(el)}
        type="search"
        className="salmon-pdf-viewer__find-input"
        aria-label={t.findLabel}
        placeholder={t.findPlaceholder}
        value={find.query}
        onChange={(e) => core.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            core.stepMatch(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            core.openFind(false);
          }
        }}
      />
      <Button variant="ghost" iconOnly aria-label={t.findPrevious} title={t.findPrevious} disabled={!snap.matchTotal} onClick={() => core.stepMatch(-1)}>
        {ICONS.previous}
      </Button>
      <Button variant="ghost" iconOnly aria-label={t.findNext} title={t.findNext} disabled={!snap.matchTotal} onClick={() => core.stepMatch(1)}>
        {ICONS.next}
      </Button>
      {toggle('matchCase', t.matchCase)}
      {toggle('wholeWord', t.wholeWord)}
      {toggle('highlightAll', t.highlightAll)}
      <span className="salmon-pdf-viewer__find-status" role="status" aria-live="polite">
        {status}
      </span>
      <Button variant="ghost" iconOnly aria-label={t.closeFind} title={t.closeFind} onClick={() => core.openFind(false)}>
        {ICONS.close}
      </Button>
    </div>
  );
}
