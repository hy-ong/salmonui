'use client';

// MarkdownEditor: a native
// <textarea> with an APG toolbar whose commands are pure text transforms
// (commands.ts) applied as one undoable replacement (internal/text-edit.ts).
// Selection, caret and resize state stay in the DOM and are read only when a
// command runs. Menus and dialogs are lazy chunks mounted on first use.

import {
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { Button, ToggleButton } from '@salmonui/buttons/button';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { portalScopeOf } from '@salmonui/core/internal/modal-host';
import { isRtl } from '@salmonui/core/internal/position';
import { pressSource } from '@salmonui/core/internal/press';
import { applyRovingMove, rovingMove } from '@salmonui/core/internal/roving';
import { replaceText, textDiff } from '@salmonui/core/internal/text-edit';
import { applyCommand, continueList, DEFAULT_MARKDOWN_SYNTAX, imageMarkdown, indentLines, insertBlock, insertSnippet, toggleInline, type MarkdownTextCommand, type TextState } from './commands.js';
import type { MarkdownDialogKind } from './dialog.js';
import { headingLabel, itemIcon, MARKDOWN_DEFAULT_LOCALE_TEXT, MORE_ICON, MARKDOWN_DEFAULT_TOOLBAR, SHORTCUTS } from './items.js';
import type { MarkdownEditorApi, MarkdownEditorProps, MarkdownEditorSource, MarkdownPreviewMode, MarkdownToolbarCustomItem, MarkdownToolbarItem, MarkdownToolbarItemId } from './types.js';

const ToolbarMenu = lazy(() => import('./menu-popup.js'));
const MarkdownDialog = lazy(() => import('./dialog.js'));

const TEXT_COMMANDS = new Set<string>(['bold', 'italic', 'strikethrough', 'superscript', 'subscript', 'uppercase', 'lowercase', 'paragraph', 'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6', 'blockquote', 'code', 'codeBlock', 'orderedList', 'unorderedList']);
const ALWAYS_ENABLED = new Set<string>(['preview', 'fullscreen']);
const HEADINGS = [0, 1, 2, 3, 4, 5, 6];

const cx = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(' ');

/** Letter of a key press independent of the keyboard layout's Alt characters. */
const letterOf = (event: KeyboardEvent): string => (event.code.startsWith('Key') ? event.code.slice(3).toLowerCase() : event.key.toLowerCase());

/** The command of a Mod shortcut, or null. Undo / redo stay native. */
export function shortcutCommand(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): MarkdownToolbarItemId | null {
  if (!(event.ctrlKey || event.metaKey)) return null;
  if (event.code === 'Equal' || event.key === '=' || event.key === '+') return event.shiftKey ? 'superscript' : 'subscript';
  const k = letterOf(event as KeyboardEvent);
  if (event.altKey) return k === 'o' ? 'unorderedList' : null;
  if (!event.shiftKey) return ({ b: 'bold', i: 'italic', k: 'link' } as const)[k as 'b'] ?? null;
  return ({ s: 'strikethrough', u: 'uppercase', l: 'lowercase', o: 'orderedList', i: 'image', e: 'table', f: 'fullscreen' } as const)[k as 's'] ?? null;
}

interface Snapshot {
  readonly before: TextState;
  readonly after: string;
}

interface Popup {
  readonly kind: 'heading' | 'more';
  readonly anchor: RefObject<HTMLElement | null>;
}

const isCustom = (item: MarkdownToolbarItem): item is MarkdownToolbarCustomItem => typeof item === 'object';

export function MarkdownEditor(props: MarkdownEditorProps): ReactElement {
  const {
    value: valueProp,
    defaultValue,
    onValueChange,
    toolbar = MARKDOWN_DEFAULT_TOOLBAR,
    toolbarOverflow = 'menu',
    stickyToolbar = false,
    preview: previewProp,
    defaultPreview,
    onPreviewChange,
    renderPreview,
    fullscreen: fullscreenProp,
    defaultFullscreen,
    onFullscreenChange,
    onUpload,
    syntax: syntaxProp,
    showCount = false,
    resizable = true,
    tabIndents = false,
    undoLimit = 100,
    locale: ownLocale,
    localeText,
    onBeforeCommand,
    onCommand,
    className,
    style,
    classNames,
    styles,
    ref,
    id: idProp,
    maxLength,
    readOnly,
    disabled,
    onKeyDown,
    onPaste,
    ...textareaProps
  } = props;
  const lang = useLocale(ownLocale);
  const locale = { ...MARKDOWN_DEFAULT_LOCALE_TEXT, ...useLocaleText('markdownEditor', localeText) };
  const syntax = syntaxProp ? { ...DEFAULT_MARKDOWN_SYNTAX, ...syntaxProp } : DEFAULT_MARKDOWN_SYNTAX;
  const initial = defaultValue ?? '';
  const [text, setText] = useControllableState(valueProp, initial, onValueChange, 'MarkdownEditor value');
  const [preview, setPreview] = useControllableState<MarkdownPreviewMode, [{ readonly source: MarkdownEditorSource }]>(previewProp, defaultPreview ?? 'off', onPreviewChange, 'MarkdownEditor preview');
  const [fullscreen, setFullscreen] = useControllableState<boolean, [{ readonly source: MarkdownEditorSource }]>(fullscreenProp, defaultFullscreen ?? false, onFullscreenChange, 'MarkdownEditor fullscreen');
  // The layout the preview item restores (the last shown mode, `tab` by default).
  const [shownMode, setShownMode] = useState<MarkdownPreviewMode>(preview === 'off' ? 'tab' : preview);
  if (preview !== 'off' && preview !== shownMode) setShownMode(preview);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [dialog, setDialog] = useState<{ readonly kind: MarkdownDialogKind; readonly selection: TextState } | null>(null);
  const [host, setHost] = useState<{ readonly container: Element | null; readonly dir: string }>({ container: null, dir: 'ltr' });
  // Toolbar items that fit (`toolbarOverflow="menu"`); null renders all (server and first client render).
  const [fit, setFit] = useState<number | null>(null);
  const deferred = useDeferredValue(text);

  const reactId = useId();
  const textareaId = idProp ?? `${reactId}-source`;
  const previewId = `${reactId}-preview`;
  const menuId = `${reactId}-menu`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLElement | null>(null);
  const moreRef = useRef<HTMLElement | null>(null);
  // Transients: the change reason of the next input event, the fallback history, upload aborts.
  const reason = useRef<'command' | 'input'>('input');
  const history = useRef<{ undo: Snapshot[]; redo: Snapshot[] }>({ undo: [], redo: [] });
  const uploads = useRef(new Set<AbortController>());

  useEffect(() => {
    const set = uploads.current;
    return () => {
      for (const c of set) c.abort();
    };
  }, []);

  // Form reset: uncontrolled restores the default, controlled is told.
  useEffect(() => {
    const form = taRef.current?.form;
    if (!form) return;
    const onReset = (): void => setText(initial, Object.freeze({ source: 'api' as const, reason: 'reset' as const }));
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  });

  const items = toolbar;
  const overflowMenu = toolbarOverflow === 'menu';
  // Measures the toolbar once per resize: item widths are read, then one state write.
  useLayoutEffect(() => {
    const bar = toolbarRef.current;
    if (!overflowMenu || !bar || typeof ResizeObserver !== 'function') return;
    const children = Array.from(bar.querySelectorAll<HTMLElement>('[data-index]'));
    const gap = parseFloat(getComputedStyle(bar).columnGap) || 0;
    const widths = children.map((el) => el.offsetWidth + gap);
    const more = (widths.find((w) => w > gap + 8) ?? 32) + gap;
    const measure = (): void => {
      const available = bar.clientWidth - 8;
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= available) return setFit(null);
      let used = more;
      let i = 0;
      while (i < widths.length && used + (widths[i] ?? 0) <= available) used += widths[i++] ?? 0;
      setFit(i);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
    // Widths depend on the item list only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overflowMenu, items]);

  const readState = (): TextState => {
    const ta = taRef.current;
    return ta ? { text: ta.value, start: ta.selectionStart, end: ta.selectionEnd } : { text, start: text.length, end: text.length };
  };

  /** Applies `next` as one replacement; native undo where `insertText` works, else the internal history. */
  const apply = (next: TextState): void => {
    const ta = taRef.current;
    if (!ta || readOnly || disabled) return;
    const before = readState();
    if (next.text !== before.text) {
      const d = textDiff(before.text, next.text);
      reason.current = 'command';
      const native = replaceText(ta, d.start, d.end, d.text);
      reason.current = 'input';
      if (!native) {
        const h = history.current;
        h.undo.push({ before, after: next.text });
        if (h.undo.length > undoLimit) h.undo.shift();
        h.redo = [];
      }
    }
    ta.focus();
    ta.setSelectionRange(next.start, next.end);
  };

  const restore = (state: TextState): void => {
    const ta = taRef.current;
    if (!ta) return;
    reason.current = 'command';
    ta.setRangeText(state.text, 0, ta.value.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    reason.current = 'input';
    ta.focus();
    ta.setSelectionRange(state.start, state.end);
  };

  /** Undo / redo from the internal history when it holds the current text; else native. */
  const historyStep = (redo: boolean, native: boolean): boolean => {
    const ta = taRef.current;
    if (!ta) return false;
    const h = history.current;
    const stack = redo ? h.redo : h.undo;
    const top = stack[stack.length - 1];
    if (top && (redo ? ta.value === top.before.text : ta.value === top.after)) {
      stack.pop();
      if (redo) {
        h.undo.push(top);
        restore({ text: top.after, start: top.after.length, end: top.after.length });
      } else {
        h.redo.push(top);
        restore(top.before);
      }
      return true;
    }
    if (!native) return false;
    ta.focus();
    try {
      return ta.ownerDocument.execCommand(redo ? 'redo' : 'undo', false);
    } catch {
      return false;
    }
  };

  const readHost = (): void => {
    const root = rootRef.current;
    if (root) setHost({ container: portalScopeOf(root), dir: isRtl(root) ? 'rtl' : 'ltr' });
  };

  const togglePreview = (source: MarkdownEditorSource): void => setPreview(preview === 'off' ? shownMode : 'off', Object.freeze({ source }));

  const run = (id: string, source: MarkdownEditorSource): void => {
    const custom = items.find((item): item is MarkdownToolbarCustomItem => isCustom(item) && item.id === id);
    if (onBeforeCommand) {
      let prevented = false;
      onBeforeCommand({
        id,
        source,
        get defaultPrevented() {
          return prevented;
        },
        preventDefault() {
          prevented = true;
        },
      });
      if (prevented) return;
    }
    if (custom) custom.onSelect(api);
    else if (TEXT_COMMANDS.has(id)) apply(applyCommand(id as MarkdownTextCommand, readState(), syntax, lang));
    else if (id === 'heading') {
      if (headingRef.current) {
        readHost();
        setPopup({ kind: 'heading', anchor: headingRef });
      }
    } else if (id === 'link' || id === 'image' || id === 'table') {
      if (readOnly || disabled) return;
      readHost();
      setDialog({ kind: id, selection: readState() });
    } else if (id === 'undo' || id === 'redo') historyStep(id === 'redo', true);
    else if (id === 'preview') togglePreview(source);
    else if (id === 'fullscreen') setFullscreen(!fullscreen, Object.freeze({ source }));
    else return;
    onCommand?.(Object.freeze({ id, source }));
  };

  const api: MarkdownEditorApi = {
    get element() {
      return taRef.current;
    },
    runCommand: (id) => run(id, 'api'),
    insertText: (snippet) => apply(insertSnippet(readState(), snippet)),
    wrapSelection: (before, after) => apply(toggleInline(readState(), before, after)),
    focus: () => taRef.current?.focus(),
    blur: () => taRef.current?.blur(),
    getSelection: () => {
      const s = readState();
      return Object.freeze({ start: s.start, end: s.end, text: s.text.slice(s.start, s.end) });
    },
    setSelection: (start, end) => taRef.current?.setSelectionRange(start, end),
  };
  useImperativeHandle(ref, () => api);

  const focusToolbar = (): void => {
    const bar = toolbarRef.current;
    if (!bar) return;
    const list = enabledItems(bar);
    (list.find((el) => el.tabIndex === 0) ?? list[0])?.focus();
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    const mod = event.ctrlKey || event.metaKey;
    if (event.altKey && event.key === 'F10') {
      event.preventDefault();
      return focusToolbar();
    }
    const command = shortcutCommand(event);
    if (command) {
      event.preventDefault();
      return run(command, 'keyboard');
    }
    if (mod && !event.altKey && (letterOf(event) === 'z' || letterOf(event) === 'y')) {
      // Only commands applied without native undo are intercepted; typing keeps the browser's stack.
      if (historyStep(letterOf(event) === 'y' || event.shiftKey, false)) event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && !mod && !event.shiftKey && !event.altKey) {
      const next = continueList(readState());
      if (next) {
        event.preventDefault();
        apply(next);
      }
      return;
    }
    if (event.key === 'Tab' && tabIndents && !mod && !event.altKey) {
      event.preventDefault();
      apply(indentLines(readState(), event.shiftKey));
      return;
    }
    if (event.key === 'Escape' && fullscreen) {
      event.preventDefault();
      setFullscreen(false, Object.freeze({ source: 'keyboard' as const }));
    }
  };

  const onTextareaPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    onPaste?.(event);
    if (event.defaultPrevented || !onUpload || readOnly || disabled) return;
    const files = Array.from(event.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    const at = readState();
    for (const file of files) {
      const controller = new AbortController();
      uploads.current.add(controller);
      Promise.resolve(onUpload(file, { signal: controller.signal })).then(
        (result) => {
          uploads.current.delete(controller);
          if (controller.signal.aborted) return;
          const ta = taRef.current;
          if (!ta) return;
          // Inserted where the paste happened, clamped to the current text.
          const pos = Math.min(at.start, ta.value.length);
          apply(insertSnippet({ text: ta.value, start: pos, end: Math.min(Math.max(at.end, pos), ta.value.length) }, imageMarkdown(result.alt ?? file.name, result.src)));
        },
        () => uploads.current.delete(controller),
      );
    }
  };

  const onToolbarKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const bar = event.currentTarget;
    if (event.key === 'Escape') {
      event.preventDefault();
      taRef.current?.focus();
      return;
    }
    const move = rovingMove(event.key, { orientation: 'horizontal', rtl: isRtl(bar) });
    if (!move) return;
    const list = enabledItems(bar);
    if (!list.length) return;
    event.preventDefault();
    const index = list.indexOf(event.target as HTMLElement);
    const target = list[applyRovingMove(move, list.length, index, () => true)];
    if (target) rove(bar, target);
  };

  const tabMode = preview === 'tab';
  const locked = Boolean(readOnly || disabled);
  const label = (item: MarkdownToolbarItemId): string => {
    const shortcut = SHORTCUTS[item];
    const name = item.startsWith('heading') && item !== 'heading' ? headingLabel(locale, Number(item.slice(7))) : (locale as Record<string, string>)[item] ?? item;
    return shortcut ? `${name} (${shortcut})` : name;
  };
  const nameOf = (item: MarkdownToolbarItemId): string => (item.startsWith('heading') && item !== 'heading' ? headingLabel(locale, Number(item.slice(7))) : ((locale as Record<string, string>)[item] ?? item));

  const visibleItems = items.filter((item) => item !== 'preview' || renderPreview);
  let firstFocusable = true;
  const rendered: ReactNode[] = visibleItems.map((item, index) => {
    const hidden = fit !== null && index >= fit;
    if (item === '|') return <span key={`sep-${index}`} className="salmon-markdown-editor-separator" role="separator" aria-orientation="vertical" data-index={index} hidden={hidden} />;
    const id = isCustom(item) ? item.id : item;
    const name = isCustom(item) ? item.label : nameOf(item);
    const itemDisabled = isCustom(item) ? Boolean(item.disabled) || Boolean(disabled) : ALWAYS_ENABLED.has(item) ? Boolean(disabled) : locked || (tabMode && item !== 'undo' && item !== 'redo');
    const tabIndex = !hidden && !itemDisabled && firstFocusable ? 0 : -1;
    if (tabIndex === 0) firstFocusable = false;
    const common = {
      'data-index': index,
      'data-salmon-toolbar-item': id,
      'aria-label': name,
      title: isCustom(item) ? item.label : label(item),
      variant: 'ghost' as const,
      size: 'sm' as const,
      iconOnly: true as const,
      disabled: itemDisabled,
      hidden,
      tabIndex,
      // The textarea keeps its selection: a toolbar press does not take focus from it.
      onPointerDown: (e: { preventDefault(): void }) => e.preventDefault(),
    };
    if (item === 'preview' || item === 'fullscreen') {
      const pressed = item === 'preview' ? preview !== 'off' : fullscreen;
      return (
        <ToggleButton key={id} {...common} pressed={pressed} aria-controls={item === 'preview' ? previewId : undefined} onPressedChange={(_next, e) => run(item, e.source)}>
          {itemIcon(item)}
        </ToggleButton>
      );
    }
    const isHeading = item === 'heading';
    return (
      <Button
        key={id}
        {...common}
        ref={isHeading ? (headingRef as never) : undefined}
        aria-haspopup={isHeading ? 'menu' : item === 'link' || item === 'image' || item === 'table' ? 'dialog' : undefined}
        aria-expanded={isHeading ? popup?.kind === 'heading' : undefined}
        aria-controls={isHeading && popup?.kind === 'heading' ? menuId : undefined}
        onClick={(e: MouseEvent) => run(id, pressSource(e))}
      >
        {isCustom(item) ? (item.icon ?? item.label) : itemIcon(item)}
      </Button>
    );
  });

  const overflowItems = fit === null ? [] : visibleItems.slice(fit).filter((item) => item !== '|');
  const menuItems =
    popup?.kind === 'heading'
      ? HEADINGS.map((level) => ({ id: level ? `heading${level}` : 'paragraph', label: headingLabel(locale, level) }))
      : overflowItems.map((item) =>
          isCustom(item)
            ? { id: item.id, label: item.label, disabled: Boolean(item.disabled) }
            : item === 'heading'
              ? { type: 'group' as const, label: locale.heading, items: HEADINGS.map((level) => ({ id: level ? `heading${level}` : 'paragraph', label: headingLabel(locale, level), disabled: locked || tabMode })) }
              : { id: item, label: nameOf(item), disabled: ALWAYS_ENABLED.has(item) ? Boolean(disabled) : locked || tabMode },
        );

  const count = text.length;
  const countStatus = maxLength !== undefined && maxLength > 0 ? (count >= maxLength ? locale.countAtLimit : count >= maxLength * 0.9 ? locale.countNearLimit : '') : '';
  const named = textareaProps['aria-label'] !== undefined || textareaProps['aria-labelledby'] !== undefined || idProp !== undefined;

  return (
    <div
      ref={rootRef}
      className={cx('salmon-markdown-editor', className)}
      style={style}
      data-preview={preview}
      data-fullscreen={fullscreen ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
    >
      {visibleItems.length ? (
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label={locale.toolbar}
          aria-controls={textareaId}
          className={cx('salmon-markdown-editor-toolbar', classNames?.toolbar)}
          style={styles?.toolbar}
          data-overflow={toolbarOverflow}
          data-sticky={stickyToolbar ? '' : undefined}
          onKeyDown={onToolbarKeyDown}
          onFocus={(e) => {
            if (e.target !== e.currentTarget && (e.target as HTMLElement).dataset['salmonToolbarItem']) rove(e.currentTarget, e.target as HTMLElement, false);
          }}
        >
          {rendered}
          {fit !== null ? (
            <Button
              ref={moreRef as never}
              className="salmon-markdown-editor-more"
              data-salmon-toolbar-item="more"
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={locale.more}
              title={locale.more}
              aria-haspopup="menu"
              aria-expanded={popup?.kind === 'more'}
              aria-controls={popup?.kind === 'more' ? menuId : undefined}
              tabIndex={-1}
              onClick={() => {
                readHost();
                setPopup({ kind: 'more', anchor: moreRef });
              }}
            >
              {MORE_ICON}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="salmon-markdown-editor-body">
        <textarea
          dir="auto"
          aria-label={named ? undefined : locale.editor}
          {...textareaProps}
          ref={taRef}
          id={textareaId}
          className={cx('salmon-markdown-editor-textarea', classNames?.textarea)}
          style={styles?.textarea}
          value={text}
          maxLength={maxLength}
          readOnly={readOnly}
          disabled={disabled}
          hidden={tabMode}
          data-resizable={resizable ? '' : undefined}
          onChange={(event) => {
            setText(event.target.value, Object.freeze({ source: reason.current === 'command' ? ('api' as const) : ('keyboard' as const), reason: reason.current }));
          }}
          onKeyDown={onTextareaKeyDown}
          onPaste={onTextareaPaste}
        />
        {preview !== 'off' && renderPreview ? (
          <div id={previewId} role="region" aria-label={locale.previewRegion} aria-live="off" dir="auto" className={cx('salmon-markdown-editor-preview', classNames?.preview)} style={styles?.preview}>
            {renderPreview(deferred)}
          </div>
        ) : null}
      </div>
      {showCount ? (
        <div className={cx('salmon-markdown-editor-count', classNames?.count)} style={styles?.count}>
          {maxLength !== undefined ? `${count} / ${maxLength}` : count}
          <span className="salmon-markdown-editor-status" role="status">
            {countStatus}
          </span>
        </div>
      ) : null}
      {popup ? (
        <Suspense fallback={null}>
          <ToolbarMenu
            id={menuId}
            anchor={popup.anchor}
            label={popup.kind === 'heading' ? locale.heading : locale.more}
            items={menuItems}
            container={host.container}
            dir={host.dir}
            onAction={(id, source) => run(id, source)}
            onClose={() => setPopup(null)}
          />
        </Suspense>
      ) : null}
      {dialog ? (
        <Suspense fallback={null}>
          <MarkdownDialog
            kind={dialog.kind}
            locale={locale}
            selection={dialog.selection.text.slice(dialog.selection.start, dialog.selection.end)}
            container={host.container}
            dir={host.dir}
            onUpload={onUpload}
            onClose={() => {
              setDialog(null);
              taRef.current?.focus();
            }}
            onInsert={(markdown, block) => {
              const saved = dialog.selection;
              const ta = taRef.current;
              setDialog(null);
              if (!ta) return;
              const len = ta.value.length;
              const at = { text: ta.value, start: Math.min(saved.start, len), end: Math.min(saved.end, len) };
              apply(block ? insertBlock(at, markdown) : insertSnippet(at, markdown));
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function enabledItems(bar: HTMLElement): HTMLElement[] {
  return Array.from(bar.querySelectorAll<HTMLElement>('[data-salmon-toolbar-item]')).filter((el) => !el.hidden && !(el as HTMLButtonElement).disabled);
}

/** Roving tabindex in the DOM (no React state): `target` becomes the toolbar's tab stop. */
function rove(bar: HTMLElement, target: HTMLElement, focus = true): void {
  for (const el of enabledItems(bar)) el.tabIndex = el === target ? 0 : -1;
  if (focus) target.focus();
}
