// Client half of RichTextEditor, loaded with the engine after hydration
// (lazy chunk): engine options from the props, change batching, toolbar
// state sync, paste cleanup and print. The initial chunk holds only the shell.
import { createEngine, toolbarState, type RichTextEngine } from '../engine/load.js';
import { cleanPastedHtml } from '../html/index.js';
import { extensionAllow } from '../engine/html-out.js';
import { itemId } from './items.js';
import { RICH_TEXT_EDITOR_DEFAULT_LOCALE_TEXT } from './locale.js';
import { fire, type EditorStore } from './store.js';
import type { RichTextEditorProps } from './types.js';

type Ref<T> = { current: T };

export interface MountDeps {
  readonly props: Ref<RichTextEditorProps>;
  readonly lastHtml: Ref<string>;
  readonly store: EditorStore;
  readonly suggestKeys: Ref<((event: KeyboardEvent) => boolean) | null>;
  readonly action: (id: string, args: readonly unknown[]) => boolean;
  readonly pastePrompt: () => Promise<'keep' | 'clean' | 'plainText' | null>;
  readonly changed: (html: string, empty: boolean) => void;
}

export interface Mounted {
  readonly engine: RichTextEngine;
  /** Emits a pending change now (blur). */
  flush(): void;
  dispose(): void;
}

export async function mountEditor(element: HTMLElement, deps: MountDeps): Promise<Mounted> {
  const p = () => deps.props.current;
  const emojiOn = () => Boolean(p().emojiList) || (Array.isArray(p().toolbar) && (p().toolbar as readonly never[]).some((item) => itemId(item) === 'emoji'));
  const engine = await createEngine({
    html: p().value ?? deps.lastHtml.current,
    embedHosts: p().embedHosts,
    extensions: p().extensions,
    sanitize: p().sanitize,
    undoLimit: p().undoLimit,
    undoGroupDelay: p().undoGroupDelay,
    enterKey: p().enterKey,
    paragraphTag: p().enterKey === 'div' ? 'div' : 'p',
    shiftEnterKey: p().shiftEnterKey,
    tabKey: p().tabKey,
    keyBindings: { 'Alt-F10': 'focusToolbar', ...p().keyBindings },
    placeholder: () => p().placeholder,
    maxLength: () => p().maxLength,
    highlight: () => p().highlight,
    codeLanguages: () => p().codeLanguages?.map((l) => (typeof l === 'string' ? { value: l, label: l } : l)),
    suggestTriggers: () => [...(p().slashMenu ? [{ id: 'slash', char: '/' }] : []), ...(emojiOn() ? [{ id: 'emoji', char: ':' }] : [])],
    onSuggestKey: (event) => deps.suggestKeys.current?.(event) ?? false,
    onAction: deps.action,
    onBeforeCommand: (command, args) => fire(p().onBeforeCommand, { command, args }),
    onCommand: (command, args, applied) => p().onCommand?.({ command, args, applied }),
    upload: () => p().onUpload,
    imageInsert: () => p().imageInsert ?? 'blob',
    uploadLabel: () => p().localeText?.uploading ?? RICH_TEXT_EDITOR_DEFAULT_LOCALE_TEXT.uploading,
    onUploadError: (error, file) => p().onUploadError?.(error, file),
    pasteMode: () => p().pasteCleanup?.mode ?? 'clean',
    cleanPaste: (html, mode) => {
      const { embedHosts, sanitize, pasteCleanup, extensions } = p();
      const allow = extensionAllow(extensions);
      return cleanPastedHtml(html, { ...pasteCleanup, mode, ...(embedHosts ? { embedHosts } : {}), ...(sanitize ? { sanitize } : {}), ...(allow.length ? { allow } : {}) });
    },
    pastePrompt: deps.pastePrompt,
    editable: () => !p().readOnly && !p().disabled,
  });
  engine.mount(element);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queued = false;
  const flush = () => {
    queued = false;
    clearTimeout(timer);
    const html = engine.getHtml();
    if (html === deps.lastHtml.current) return;
    deps.lastHtml.current = html;
    deps.changed(html, engine.isEmpty);
    p().onChange?.(html);
  };
  const sync = () => {
    if (deps.store.set({ ...toolbarState(engine), ready: true })) p().onToolbarStateChange?.(deps.store.get());
  };
  const off = engine.subscribe((tr) => {
    sync();
    if (!tr?.docChanged) return;
    const delay = p().changeDelay ?? 0;
    if (delay > 0) {
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    } else if (!queued) {
      queued = true;
      queueMicrotask(flush);
    }
  });
  sync();
  return {
    engine,
    flush,
    dispose() {
      clearTimeout(timer);
      off();
      engine.destroy();
    },
  };
}

const PRINT_CSS = 'body{font:14px/1.5 system-ui,sans-serif;margin:24px}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}';

/** Prints sanitized content only, from a sandboxed hidden iframe. */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.className = 'salmon-rich-text__print';
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.style.cssText = 'position:fixed;inline-size:0;block-size:0;border:0;inset-block-start:0';
  const title = document.title.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_CSS}</style></head><body>${html}</body></html>`;
  frame.onload = () => {
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  document.body.append(frame);
}

/** One block per line for the source view. */
export function prettify(html: string): string {
  return html.replace(/(<\/(?:p|h[1-6]|blockquote|pre|ul|ol|li|table|tr|figure|div|details)>|<hr>|<br>)/g, '$1\n').trim();
}
