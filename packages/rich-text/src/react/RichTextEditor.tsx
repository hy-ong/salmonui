'use client';
// RichTextEditor.
// The server renders the toolbar shell and the sanitized value in the content
// element; after hydration the ProseMirror engine (a lazy chunk loaded from an
// effect) mounts on that same element. Editor state lives in the engine; React
// holds only UI state (dialogs, source view, fullscreen) and reads a derived
// toolbar snapshot through useSyncExternalStore.
import { lazy, Suspense, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { MentionDataSource, MentionItem, MentionProps } from '@salmonui/dropdowns/mention';
import { useFieldContext } from '@salmonui/core/internal/field/context';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { htmlToText } from '../html/index.js';
import { paragraphsAsDiv, sanitizeFor } from '../engine/html-out.js';
import { focusToolbar, Popover } from './overlay.js';
import { DEFAULTS, EditorToolbar, ToolbarContext, itemId, type ToolbarContextValue } from './items.js';
import { EditorStore, fire, initialSnapshot, useEditorState } from './store.js';
import { format, RICH_TEXT_EDITOR_DEFAULT_LOCALE_TEXT, type RichTextEditorLocaleText } from './locale.js';
import type { SuggestItem } from './dialogs.js';
import type { RichTextEngine } from '../engine/index.js';
import type {
  RichTextDialogId,
  RichTextEditorActions,
  RichTextEditorProps,
  RichTextPopupId,
  RichTextQuickToolbars,
  RichTextSlashItem,
  RichTextToolbarCustomItem,
  RichTextToolbarItem,
} from './types.js';

const Dialogs = lazy(() => import('./dialogs.js'));
// Mention (and its collection code) loads only when `mentions` is set.
const Mention = lazy(() => import('@salmonui/dropdowns/mention').then((m) => ({ default: m.Mention }))) as unknown as <T>(props: MentionProps<T>) => ReactElement;

/** Default toolbar. */
export const RICH_TEXT_DEFAULT_TOOLBAR: readonly RichTextToolbarItem[] = Object.freeze([
  'undo', 'redo', '|', 'formats', 'fontName', 'fontSize', '|', 'bold', 'italic', 'underline', 'strikethrough', 'fontColor', 'backgroundColor', '|',
  'alignments', 'orderedList', 'unorderedList', 'checklist', 'outdent', 'indent', '|', 'link', 'image', 'table', 'codeBlock', 'blockquote', 'horizontalRule', '|',
  'clearFormat', 'findReplace', 'sourceCode', 'fullscreen',
] as const);

/** Default quick toolbars; `text` is off unless `toolbar="floating"`. */
export const RICH_TEXT_DEFAULT_QUICK_TOOLBARS: Required<{ [K in keyof RichTextQuickToolbars]: readonly RichTextToolbarItem[] }> = Object.freeze({
  link: ['openLink', 'editLink', 'removeLink'],
  image: ['editImage', 'alignments', 'removeNode'],
  table: ['addRowBefore', 'addRowAfter', 'deleteRow', 'addColumnBefore', 'addColumnAfter', 'deleteColumn', 'mergeCells', 'splitCell', 'toggleHeaderRow', 'tableStyle', 'deleteTable'],
  audio: ['removeNode'],
  video: ['removeNode'],
  text: ['bold', 'italic', 'underline', 'strikethrough', 'link', 'fontColor', 'backgroundColor', 'clearFormat'],
});

const SLASH_DEFAULT: readonly RichTextSlashItem[] = ['paragraph', 'heading1', 'heading2', 'heading3', 'unorderedList', 'orderedList', 'checklist', 'blockquote', 'codeBlock', 'table', 'image', 'horizontalRule'];
type Rect = { left: number; top: number; bottom: number };
const DIALOG_ACTIONS = new Set(['link', 'editLink', 'image', 'editImage', 'audio', 'video', 'embed', 'table', 'findReplace', 'aiAssistant']);
/**
 * Rich text editor on ProseMirror (`@salmonui/rich-text`). HTML value,
 * toolbar, quick toolbars, dialogs, mentions, slash and emoji menus.
 */
export function RichTextEditor<TMention = MentionItem>(props: RichTextEditorProps<TMention>): ReactElement {
  const {
    value,
    defaultValue,
    toolbar = RICH_TEXT_DEFAULT_TOOLBAR,
    toolbarOverflow = 'menu',
    toolbarPosition = 'top',
    stickyToolbar,
    quickToolbars,
    placeholder,
    readOnly,
    disabled,
    name,
    required,
    invalid: invalidProp,
    showCount,
    maxLength,
    resizable,
    className,
    style,
    id,
    embedHosts,
    sanitize,
    mentions,
    actionsRef,
    onImport,
  } = props;
  const localeText = useLocaleText('richTextEditor', props.localeText);
  const locale: RichTextEditorLocaleText = useMemo(() => ({ ...RICH_TEXT_EDITOR_DEFAULT_LOCALE_TEXT, ...localeText }), [localeText]);
  const autoId = useId();
  // Inside a Salmon `Field` (Inputs): its label, description, error and validation state.
  const field = useFieldContext();
  const invalid = invalidProp === true || field?.invalid === true;
  const contentId = id ?? field?.inputId ?? `${autoId}content`;
  const [initial] = useState(() => {
    const clean = sanitizeFor(value ?? defaultValue ?? '', { embedHosts, sanitize, extensions: props.extensions });
    // `enterKey: 'div'` writes paragraphs as <div> on the server too, like getHtml.
    const html = props.enterKey === 'div' ? paragraphsAsDiv(clean) : clean;
    return { html, count: htmlToText(html).replace(/\n/g, '').length, empty: html.trim() === '' };
  });
  const [store] = useState(() => new EditorStore(initialSnapshot(initial.count, initial.empty)));
  const [engine, setEngine] = useState<RichTextEngine | null>(null);
  const [dialog, setDialog] = useState<{ id: RichTextDialogId; linkHref: string | null; imageAttrs: Record<string, unknown> | null } | null>(null);
  const [picker, setPicker] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [fsState, setFsState] = useState(props.defaultFullscreen ?? false);
  const [suppressed, setSuppressed] = useState<string | null>(null);
  const fullscreen = props.fullscreen ?? fsState;
  const latest = useRef(props);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const lastHtml = useRef(initial.html);
  const flushRef = useRef<() => void>(() => undefined);
  // The client chunk (engine options, print, source formatting) once loaded.
  const client = useRef<typeof import('./client.js') | null>(null);
  const pasteResolver = useRef<((choice: 'keep' | 'clean' | 'plainText' | null) => void) | null>(null);
  const suggestKeys = useRef<((event: KeyboardEvent) => boolean) | null>(null);
  const painterClick = useRef(0);
  // Whether the last toolbar interaction was a pointer (refocus the editor) or a key (stay in the toolbar).
  const pointer = useRef(false);
  const ui = useRef<{ action(id: string, args: readonly unknown[]): boolean; openDialog(id: RichTextDialogId): void; closeDialog(): void }>({
    action: () => false,
    openDialog: () => undefined,
    closeDialog: () => undefined,
  });

  const syncInput = (html: string, empty: boolean) => {
    const input = inputRef.current;
    if (input) input.value = required && empty ? '' : html;
  };

  // ---------------------------------------------------------------------------
  // UI actions (dialogs, source view, fullscreen, print, import)
  // ---------------------------------------------------------------------------

  const refocus = () => {
    engine?.focus();
    // Again after a menu returned focus to its trigger.
    setTimeout(() => engine?.focus());
  };
  const setFullscreen = (next: boolean) => {
    if (props.fullscreen === undefined) setFsState(next);
    latest.current.onFullscreenChange?.(next);
  };
  const openDialog = (dialogId: RichTextDialogId, edit = false) => {
    if (!engine) return;
    if (!fire(latest.current.onBeforeDialogOpen, { dialog: dialogId })) return;
    const node = edit ? engine.selectedNode() ?? (engine.state.selection.$from.parent.type.name === 'figure' ? engine.state.selection.$from.parent : null) : null;
    setDialog({ id: dialogId, linkHref: store.get().link, imageAttrs: node ? { ...node.attrs } : null });
  };
  const closeDialog = () => {
    if (!dialog) return;
    setDialog(null);
    latest.current.onDialogClose?.({ dialog: dialog.id });
    if (dialog.id === 'pastePrompt') pasteResolver.current?.(null);
    pasteResolver.current = null;
    refocus();
  };
  const toggleSource = () => {
    if (!engine) return;
    if (source === null) {
      setSource(client.current?.prettify(engine.getHtml()) ?? engine.getHtml());
      return;
    }
    const text = sourceRef.current?.value ?? source;
    setSource(null);
    engine.setHtml(text, { addToHistory: true });
    refocus();
  };
  const action = (actionId: string, args: readonly unknown[]): boolean => {
    if (!engine) return false;
    switch (actionId) {
      case 'link':
      case 'editLink':
        openDialog('link');
        return true;
      case 'image':
      case 'editImage':
        openDialog('image', actionId === 'editImage');
        return true;
      case 'audio':
      case 'video':
      case 'embed':
      case 'table':
      case 'findReplace':
      case 'aiAssistant':
        if (actionId === 'aiAssistant' && !latest.current.aiAssistant) return false;
        openDialog(actionId);
        return true;
      case 'openLink': {
        const href = store.get().link;
        if (href) window.open(href, '_blank', 'noopener,noreferrer');
        return Boolean(href);
      }
      case 'removeLink':
        return engine.run('unsetLink') !== false;
      case 'removeNode':
        return engine.run('deleteNode') !== false;
      case 'sourceCode':
        toggleSource();
        return true;
      case 'fullscreen':
        setFullscreen(!fullscreen);
        return true;
      case 'print':
        client.current?.printHtml(engine.getHtml());
        return true;
      case 'emoji':
        setPicker(true);
        return true;
      case 'import':
        importRef.current?.click();
        return Boolean(importRef.current);
      case 'focusToolbar':
        return focusToolbar(toolbarRef.current);
      case 'formatPainter': {
        const now = Date.now();
        const double = now - painterClick.current < 400;
        painterClick.current = now;
        if (double) return engine.run('copyFormat', true) !== false;
        return engine.run(engine.painterActive ? 'cancelFormatPainter' : 'copyFormat', false) !== false;
      }
      default:
        void args;
        return false;
    }
  };
  useLayoutEffect(() => {
    // The client reads `localeText` through `latest`: the provider-merged text.
    latest.current = localeText === props.localeText ? props : { ...props, localeText: localeText! };
    ui.current = { action, openDialog, closeDialog };
  });

  // ---------------------------------------------------------------------------
  // Engine mount (lazy chunk, client only)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let live = true;
    let mounted: import('./client.js').Mounted | null = null;
    void import('./client.js').then(async (mod) => {
      const element = contentRef.current;
      if (!live || !element) return;
      client.current = mod;
      const next = await mod.mountEditor(element, {
        // The client reads props untyped by the mention item type.
        props: latest as unknown as import('./client.js').MountDeps['props'],
        lastHtml,
        store,
        suggestKeys,
        action: (actionId, args) => ui.current.action(actionId, args),
        pastePrompt: () =>
          new Promise((resolve) => {
            pasteResolver.current = resolve;
            setDialog({ id: 'pastePrompt', linkHref: null, imageAttrs: null });
          }),
        changed: (html, empty) => syncInput(html, empty),
      });
      if (!live) {
        next.dispose();
        return;
      }
      mounted = next;
      flushRef.current = next.flush;
      setEngine(next.engine);
    });
    return () => {
      live = false;
      mounted?.dispose();
      store.set({ ready: false });
      setEngine(null);
    };
    // The engine mounts once; option props are read through `latest`.
  }, [store]); // eslint-disable-line react-hooks/exhaustive-deps

  // Controlled value: changes from outside go through the engine, never innerHTML.
  useEffect(() => {
    if (!engine || value === undefined || value === lastHtml.current) return;
    engine.setHtml(value);
    lastHtml.current = engine.getHtml();
    syncInput(lastHtml.current, engine.isEmpty);
  }, [engine, value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Option changes that affect editability and decorations.
  const highlight = props.highlight;
  useEffect(() => {
    engine?.refresh();
  }, [engine, readOnly, disabled, placeholder, highlight, maxLength]);

  // Escape leaves fullscreen unless a dialog or popup used it.
  useEffect(() => {
    if (!fullscreen) return;
    // Capture phase, before the editor's own handlers; open overlays and the format painter keep their Escape.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || engine?.painterActive) return;
      if (document.querySelector('.salmon-rich-text__backdrop, .salmon-rich-text__popup, .salmon-mention-popup, .salmon-menu[role="menu"]')) return;
      if (!rootRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      ui.current.action('fullscreen', []);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fullscreen, engine]);

  // Form reset restores defaultValue.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || !engine) return;
    const reset = () => {
      engine.setHtml(latest.current.defaultValue ?? '');
      lastHtml.current = engine.getHtml();
      setTimeout(() => syncInput(lastHtml.current, engine.isEmpty));
    };
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Actions (actionsRef)
  // ---------------------------------------------------------------------------

  const actions = useMemo<RichTextEditorActions | null>(() => {
    if (!engine) return null;
    const commands = Object.fromEntries(Object.keys(engine.commands).map((key) => [key, (...args: unknown[]) => engine.run(key, ...args)])) as unknown as RichTextEditorActions['commands'];
    return {
      commands,
      run: (commandId, ...args) => engine.run(commandId, ...args),
      getHtml: (options) => engine.getHtml(options),
      getText: () => engine.getText(),
      getSelection: () => engine.getSelection(),
      setSelection: (anchor, head) => engine.setSelection(anchor, head),
      focus: () => engine.focus(),
      clearHistory: () => engine.clearHistory(),
      openDialog: (dialogId) => ui.current.openDialog(dialogId),
      closeDialog: () => ui.current.closeDialog(),
      insertFiles: (files) => engine.insertFiles(files),
      engine,
    };
  }, [engine]);
  useImperativeHandle(actionsRef as never, () => actions, [actions]);
  useEffect(() => {
    if (actions) latest.current.onReady?.(actions);
  }, [actions]);

  // ---------------------------------------------------------------------------
  // Toolbar context and popups
  // ---------------------------------------------------------------------------

  const perform = (itemIdValue: string, ...args: unknown[]) => {
    if (!engine) return;
    if (!fire(latest.current.onToolbarItemClick, { id: itemIdValue })) return;
    const result = engine.run(itemIdValue, ...args);
    void result;
    if (pointer.current && !DIALOG_ACTIONS.has(itemIdValue) && itemIdValue !== 'emoji' && itemIdValue !== 'sourceCode' && itemIdValue !== 'import') refocus();
  };
  const ctx: ToolbarContextValue = {
    store,
    locale,
    perform,
    custom: (item: RichTextToolbarCustomItem) => {
      if (!fire(latest.current.onToolbarItemClick, { id: item.id }) || !actions) return;
      if (item.onClick) item.onClick(actions);
      else if (item.command) engine?.run(item.command);
      if (pointer.current) refocus();
    },
    extensionItems: Object.fromEntries((props.extensions ?? []).flatMap((ext) => ext.toolbarItems ?? []).map((item) => [item.id, { id: item.id, label: item.label, command: item.command, ...(item.icon != null ? { icon: item.icon as ReactNode } : {}) }])),
    locked: !engine || Boolean(readOnly) || Boolean(disabled),
    sourceMode: source !== null,
    fullscreen,
    fontFamilies: props.fontFamilies ?? DEFAULTS.fontFamilies,
    fontSizes: props.fontSizes ?? DEFAULTS.fontSizes,
    colors: props.colors ?? DEFAULTS.colors,
  };

  const floating = toolbar === 'floating';
  const quick = quickToolbars === false ? null : quickToolbars;
  const kind = useEditorState(store, (s) => {
    if (!s.ready || !s.focused || source !== null) return null;
    if (s.node === 'image' || s.node === 'figure') return 'image';
    if (s.node === 'audio' || s.node === 'video') return s.node;
    if (s.link !== null && s.selectionEmpty) return 'link';
    if (!s.selectionEmpty && !s.inTable) return 'text';
    if (s.inTable) return 'table';
    return null;
  });
  const quickItems = (() => {
    if (!kind || quickToolbars === false) return null;
    const own = quick?.[kind];
    if (own === false) return null;
    if (kind === 'text' && !own && !floating) return null;
    return own ?? RICH_TEXT_DEFAULT_QUICK_TOOLBARS[kind];
  })();
  const suggest = useEditorState(store, (s) => (s.suggest && s.focused ? `${s.suggest.id}\u0000${s.suggest.query}` : ''));
  const [suggestId, suggestQuery] = suggest ? suggest.split('\u0000') : ['', ''];
  const popupKind = picker ? 'emoji' : suggestId === 'slash' ? 'slash' : suggestId === 'emoji' ? 'emojiTrigger' : null;
  const popupId: RichTextPopupId | null = popupKind === 'emojiTrigger' ? 'emoji' : popupKind;
  const quickId: RichTextPopupId | null = kind ? (floating && kind === 'text' ? 'floating' : kind) : null;
  // onBeforePopupOpen: a prevented popup stays closed until its context changes.
  const popupKey = `${popupId ?? ''}|${quickItems ? quickId : ''}`;
  useEffect(() => {
    const callback = latest.current.onBeforePopupOpen;
    setSuppressed(null);
    if (!callback) return;
    for (const popup of [popupId, quickItems ? quickId : null]) {
      if (!popup) continue;
      if (!fire(callback, { popup })) setSuppressed((s) => (s ? `${s}|${popup}` : popup));
    }
  }, [popupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocked = (popup: string | null) => Boolean(popup && suppressed?.split('|').includes(popup));

  const selectionRect = (): Rect | null => {
    const view = engine?.view;
    if (!view) return null;
    const { from, to } = view.state.selection;
    try {
      const node = engine.selectedNode() ? (view.nodeDOM(from) as HTMLElement | null) : null;
      if (node?.getBoundingClientRect) {
        const r = node.getBoundingClientRect();
        return { left: r.left, top: r.top, bottom: r.bottom };
      }
      const a = view.coordsAtPos(from);
      const b = view.coordsAtPos(to);
      return { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
    } catch {
      return null;
    }
  };
  const suggestRect = (): Rect | null => {
    const view = engine?.view;
    const active = engine?.suggest;
    if (!view || !active) return picker ? selectionRect() : null;
    try {
      return view.coordsAtPos(active.from);
    } catch {
      return null;
    }
  };

  const slashItems: SuggestItem[] = (Array.isArray(props.slashMenu) ? props.slashMenu : SLASH_DEFAULT).map((item) =>
    typeof item === 'string'
      ? { id: item, label: (locale as Record<string, string>)[item] ?? item, run: () => (item === 'emoji' ? setPicker(true) : perform(item)) }
      : { id: item.id, label: item.label, keywords: item.keywords, run: () => actions && item.onSelect(actions) },
  );

  const mentionData = useMemo(() => {
    if (!mentions) return undefined;
    if (mentions.items) return mentions.items;
    const search = mentions.onSearch;
    if (!search) return undefined;
    const source: MentionDataSource<TMention> = {
      read: (request) => search(request.query.search?.text ?? '').then((rows) => ({ version: request.version, rows, totalRowCount: rows.length })),
    };
    return source;
  }, [mentions]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const count = useEditorState(store, (s) => s.count);
  const toolbarEl =
    toolbar === false || floating ? null : (
      <EditorToolbar
        items={toolbar}
        className={stickyToolbar ? 'salmon-rich-text__toolbar salmon-rich-text__toolbar--sticky' : 'salmon-rich-text__toolbar'}
        label={locale.toolbar}
        controls={contentId}
        overflow={toolbarOverflow}
        onEscape={() => engine?.focus()}
        toolbarRef={(el) => {
          toolbarRef.current = el;
        }}
      />
    );
  // A `Field` label is a <label for> that cannot name a contenteditable, so the content points at it.
  const labelledBy = props['aria-labelledby'] ?? (field && props['aria-label'] === undefined ? field.labelId : undefined);
  const label = props['aria-label'] ?? (labelledBy ? undefined : locale.content);
  const describedBy = [props['aria-describedby'], field?.inputProps['aria-describedby']].filter(Boolean).join(' ') || undefined;
  return (
    <ToolbarContext value={ctx}>
      <div
        ref={rootRef}
        className={className ? `salmon-rich-text ${className}` : 'salmon-rich-text'}
        style={style}
        data-toolbar-position={toolbarPosition}
        data-fullscreen={fullscreen ? '' : undefined}
        data-disabled={disabled ? '' : undefined}
        data-readonly={readOnly ? '' : undefined}
        data-invalid={invalid ? '' : undefined}
        data-source={source !== null ? '' : undefined}
        data-resizable={resizable ? '' : undefined}
        data-ready={engine ? '' : undefined}
        onFocus={() => {
          if (!store.get().focused) {
            store.set({ focused: true });
            latest.current.onFocus?.();
          }
        }}
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          if (next && (rootRef.current?.contains(next) || (next as Element).closest?.('.salmon-menu, .salmon-mention-popup'))) return;
          store.set({ focused: false });
          flushRef.current();
          latest.current.onBlur?.(lastHtml.current);
          field?.onBlur();
        }}
        onPointerDownCapture={() => {
          pointer.current = true;
        }}
        onKeyDownCapture={() => {
          pointer.current = false;
        }}
      >
        {toolbarPosition === 'top' ? toolbarEl : null}
        <div className="salmon-rich-text__body">
          <div
            ref={contentRef}
            id={contentId}
            className="salmon-rich-text__content salmon-rich-text-content"
            role="textbox"
            aria-multiline="true"
            aria-label={label}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-errormessage={invalid ? field?.inputProps['aria-errormessage'] : undefined}
            aria-readonly={readOnly || undefined}
            aria-disabled={disabled || undefined}
            aria-required={required || undefined}
            aria-invalid={invalid || undefined}
            aria-placeholder={placeholder}
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: initial.html }}
          />
          {source !== null ? <textarea ref={sourceRef} className="salmon-rich-text__source" aria-label={locale.sourceCodeLabel} defaultValue={source} spellCheck={false} /> : null}
        </div>
        {toolbarPosition === 'bottom' ? toolbarEl : null}
        {showCount || maxLength !== undefined ? (
          <div className="salmon-rich-text__status">
            {showCount ? <span className="salmon-rich-text__count">{maxLength !== undefined ? format(locale.charactersOf, { count, max: maxLength }) : format(locale.characters, { count })}</span> : null}
            {maxLength !== undefined ? (
              <span className="salmon-rich-text__sr" aria-live="polite">
                {count >= maxLength ? locale.limitReached : ''}
              </span>
            ) : null}
          </div>
        ) : null}
        {name !== undefined || required ? (
          <input
            ref={inputRef}
            type={required ? 'text' : 'hidden'}
            className={required ? 'salmon-rich-text__validator' : undefined}
            tabIndex={required ? -1 : undefined}
            aria-hidden={required ? 'true' : undefined}
            name={name}
            required={required}
            defaultValue={required && initial.empty ? '' : initial.html}
            onInvalid={() => {
              engine?.focus();
              // Reveals the Field's rules (its own invalid listener sits on a native control it renders).
              field?.onBlur();
            }}
          />
        ) : null}
        {onImport ? (
          <input
            ref={importRef}
            type="file"
            hidden
            accept={props.importAccept ?? '.docx,.html,.htm,.txt'}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file || !engine) return;
              const html = await onImport(file);
              engine.focus();
              engine.run('insertHtml', html, { blocks: true });
            }}
          />
        ) : null}
        {engine && quickItems && !blocked(quickId) && popupKind === null ? (
          <Popover anchor={selectionRect} subscribe={store.subscribe} className="salmon-rich-text__quick" data-quick={kind ?? ''} placement={kind === 'link' || kind === 'table' ? 'below' : 'above'}>
            <EditorToolbar items={quickItems} className="salmon-rich-text__toolbar salmon-rich-text__toolbar--quick" label={kind === 'text' && floating ? locale.toolbar : locale[kind === 'text' ? 'toolbar' : kind === 'link' ? 'editLink' : kind === 'image' ? 'editImage' : kind === 'table' ? 'table' : kind!]} overflow="wrap" onEscape={() => engine.focus()} />
          </Popover>
        ) : null}
        {engine && mentions && engine.mentionTarget ? (
          <Suspense fallback={null}>
          <Mention
            {...mentions.mentionProps}
            editor={engine.mentionTarget}
            triggers={[{ char: mentions.trigger ?? '@', ...(mentionData ? { data: mentionData } : {}), suffix: ' ' }]}
            {...(mentions.renderItem ? { renderItem: mentions.renderItem } : {})}
          />
          </Suspense>
        ) : null}
        {actions && (dialog || (popupKind && !blocked(popupId))) ? (
          <Suspense fallback={null}>
            <Dialogs
              dialog={dialog?.id ?? null}
              popup={popupKind && !blocked(popupId) ? popupKind : null}
              locale={locale}
              actions={actions}
              store={store}
              close={closeDialog}
              closePopup={() => {
                if (picker) setPicker(false);
                else engine?.dismissSuggest();
              }}
              anchor={suggestRect}
              query={suggestQuery ?? ''}
              slashItems={slashItems}
              suggestKeys={suggestKeys}
              completeSuggest={(text) => engine?.completeSuggest(text)}
              emojiList={props.emojiList}
              onBrowseFiles={props.onBrowseFiles}
              aiAssistant={props.aiAssistant}
              pasteChoice={(choice) => {
                const resolve = pasteResolver.current;
                pasteResolver.current = null;
                setDialog(null);
                latest.current.onDialogClose?.({ dialog: 'pastePrompt' });
                resolve?.(choice);
              }}
              linkHref={dialog?.linkHref ?? null}
              imageAttrs={dialog?.imageAttrs ?? null}
            />
          </Suspense>
        ) : null}
      </div>
    </ToolbarContext>
  );
}
