// The rich text engine: one ProseMirror state with the schema,
// commands, history, key bindings, input rules and plugins. It runs headless
// (Node, tests: commands apply to the state directly) and mounts an
// EditorView on an existing element (the server-rendered content element).
import { DOMParser as PMDOMParser, Fragment, Slice, type Node as PMNode, type Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, Plugin, TextSelection, type Command, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history } from 'prosemirror-history';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { columnResizing, tableEditing } from 'prosemirror-tables';
import { createSchema } from './schema.js';
import { parseShim } from './dom-shim.js';
import { serializeHtml, serializeText } from './serialize.js';
import { createCommands } from './commands.js';
import { keymaps, rules } from './keymap.js';
import {
  EXTERNAL,
  characterCount,
  findKey,
  findPlugin,
  findUpload,
  highlightPlugin,
  interactionPlugin,
  isEmptyDoc,
  maxLengthPlugin,
  painterKey,
  painterPlugin,
  placeholderPlugin,
  suggestKey,
  suggestPlugin,
  textBeforeCaret,
  uploadKey,
  undoLimitPlugin,
  uploadPlugin,
  type HighlightFn,
  type SuggestState,
  type SuggestTrigger,
} from './plugins.js';
import { nodeViews } from './nodeviews.js';
import type { SanitizeHook } from '../html/index.js';
import { paragraphsAsDiv, sanitizeFor } from './html-out.js';
import type { RichTextCommandName, RichTextCommands, RichTextExtension, RichTextKeyBindings, RichTextSelection } from './types.js';
import type { MentionEditorInsertion, MentionEditorTarget } from '@salmonui/dropdowns/mention';

export type PasteMode = 'keep' | 'clean' | 'plainText' | 'prompt';

export interface UploadResult {
  readonly src: string;
  readonly alt?: string | undefined;
}

export type UploadHandler = (file: File, context: { readonly signal: AbortSignal }) => Promise<UploadResult>;

export interface EngineOptions {
  readonly html?: string | undefined;
  readonly embedHosts?: readonly string[] | undefined;
  readonly extensions?: readonly RichTextExtension[] | undefined;
  /** Extends the always-on sanitizer applied before parsing and to getHtml output. */
  readonly sanitize?: SanitizeHook | undefined;
  readonly undoLimit?: number | undefined;
  readonly undoGroupDelay?: number | undefined;
  readonly enterKey?: 'p' | 'div' | 'br' | undefined;
  /** Paragraphs are written as `<div>` in getHtml (`enterKey: 'div'`); `<div>` parses back to a paragraph. */
  readonly paragraphTag?: 'p' | 'div' | undefined;
  readonly shiftEnterKey?: 'p' | 'div' | 'br' | undefined;
  readonly tabKey?: 'indent' | 'focus' | undefined;
  readonly keyBindings?: RichTextKeyBindings | undefined;
  readonly placeholder?: (() => string | undefined) | undefined;
  readonly maxLength?: (() => number | undefined) | undefined;
  readonly highlight?: (() => HighlightFn | undefined) | undefined;
  readonly codeLanguages?: (() => readonly { readonly value: string; readonly label: string }[] | undefined) | undefined;
  readonly suggestTriggers?: (() => readonly SuggestTrigger[]) | undefined;
  readonly onSuggestKey?: ((event: KeyboardEvent) => boolean) | undefined;
  /** UI actions (dialogs, fullscreen, source view) reached from key bindings and `run`. */
  readonly onAction?: ((id: string, args: readonly unknown[]) => boolean) | undefined;
  /** Return false to cancel a command (`onBeforeCommand`). */
  readonly onBeforeCommand?: ((command: string, args: readonly unknown[]) => boolean) | undefined;
  readonly onCommand?: ((command: string, args: readonly unknown[], applied: boolean) => void) | undefined;
  readonly upload?: (() => UploadHandler | undefined) | undefined;
  readonly imageInsert?: (() => 'base64' | 'blob') | undefined;
  readonly uploadLabel?: (() => string) | undefined;
  readonly onUploadError?: ((error: unknown, file: File) => void) | undefined;
  readonly pasteMode?: (() => PasteMode) | undefined;
  /** Paste cleanup: returns the HTML to parse for `keep` or `clean`. */
  readonly cleanPaste?: ((html: string, mode: 'keep' | 'clean') => string) | undefined;
  readonly pastePrompt?: (() => Promise<'keep' | 'clean' | 'plainText' | null>) | undefined;
  readonly editable?: (() => boolean) | undefined;
  readonly attributes?: (() => Record<string, string>) | undefined;
}

type Listener = (tr: Transaction | null) => void;

const ALIASES: Readonly<Record<string, readonly [RichTextCommandName, ...unknown[]]>> = {
  strikethrough: ['strike'],
  inlineCode: ['code'],
  alignLeft: ['textAlign', 'left'],
  alignCenter: ['textAlign', 'center'],
  alignRight: ['textAlign', 'right'],
  alignJustify: ['textAlign', 'justify'],
  unorderedList: ['bulletList'],
  checklist: ['taskList'],
  horizontalLine: ['horizontalRule'],
  heading1: ['heading', 1],
  heading2: ['heading', 2],
  heading3: ['heading', 3],
  heading4: ['heading', 4],
  heading5: ['heading', 5],
  heading6: ['heading', 6],
};

export class RichTextEngine {
  readonly schema: Schema;
  readonly commands: RichTextCommands;
  readonly extensionCommands: Record<string, (...args: never[]) => Command>;
  /** Undo and redo of an extension that replaces the history, else null. */
  readonly historyCommands: { readonly undo: Command; readonly redo: Command } | null;
  state: EditorState;
  view: EditorView | null = null;
  #listeners = new Set<Listener>();
  #history: Plugin;
  #options: EngineOptions;
  #pasteOverride: PasteMode | null = null;
  #uploads = new Map<string, AbortController>();
  #mention: MentionEditorTarget | null = null;

  constructor(options: EngineOptions, extensionPlugins: readonly Plugin[], schema?: Schema) {
    this.#options = options;
    const extensions = options.extensions ?? [];
    this.schema = schema ?? engineSchema(options);
    this.extensionCommands = Object.assign({}, ...extensions.map((e) => e.commands ?? {}));
    this.commands = createCommands({ schema: this.schema, state: () => this.state, exec: (cmd) => this.exec(cmd), parseSlice: (html) => this.parseSlice(html) });
    // An extension's history (the /collab Yjs undo manager) replaces undo and redo.
    this.historyCommands = extensions.find((e) => e.history)?.history ?? null;
    const replaced = this.historyCommands;
    if (replaced) Object.assign(this.commands, { undo: () => this.exec(replaced.undo), redo: () => this.exec(replaced.redo) });
    this.#history = historyPlugin(options);
    const replacesHistory = extensions.some((e) => e.replacesHistory);
    const plugins: Plugin[] = [
      ...extensionPlugins,
      // Before the key maps: an open slash or emoji popup takes Enter, arrows and Escape.
      suggestPlugin(options.suggestTriggers ?? (() => []), options.onSuggestKey ?? (() => false)),
      rules(this.schema, extensions.flatMap((e) => e.inputRules?.(this.schema) ?? [])),
      ...keymaps(this.schema, {
        enterKey: options.enterKey,
        shiftEnterKey: options.shiftEnterKey,
        tabKey: options.tabKey,
        keyBindings: options.keyBindings,
        extensionBindings: extensions.map((e) => e.keyBindings ?? {}),
        run: (id) => this.run(id) !== false,
      }),
      ...(replacesHistory ? [] : [this.#history, undoLimitPlugin(options.undoLimit ?? 30)]),
      placeholderPlugin(options.placeholder ?? (() => undefined)),
      maxLengthPlugin(options.maxLength ?? (() => undefined)),
      findPlugin(),
      painterPlugin(() => this.run('applyFormat')),
      uploadPlugin(options.uploadLabel ?? (() => 'Uploading')),
      highlightPlugin(options.highlight ?? (() => undefined)),
      interactionPlugin(),
      columnResizing({ cellMinWidth: 40 }),
      tableEditing(),
      dropCursor(),
      gapCursor(),
    ];
    this.state = EditorState.create({ doc: this.parseHtml(options.html ?? ''), plugins });
  }

  // -------------------------------------------------------------------------
  // HTML in and out
  // -------------------------------------------------------------------------

  #sanitize(html: string): string {
    return sanitizeFor(html, this.#options);
  }

  #dom(html: string): Node {
    const clean = this.#sanitize(html);
    if (typeof document !== 'undefined') {
      const template = document.createElement('template');
      template.innerHTML = clean;
      return template.content;
    }
    return parseShim(clean) as unknown as Node;
  }

  parseHtml(html: string): PMNode {
    const doc = PMDOMParser.fromSchema(this.schema).parse(this.#dom(html));
    return doc.childCount ? doc : this.schema.topNodeType.createAndFill()!;
  }

  parseSlice(html: string): Slice {
    return PMDOMParser.fromSchema(this.schema).parseSlice(this.#dom(html));
  }

  getHtml(options: { readonly xhtml?: boolean | undefined } = {}): string {
    if (isEmptyDoc(this.state.doc)) return '';
    const div = this.#options.paragraphTag === 'div';
    if (options.xhtml) return serializeHtml(this.state.doc, { xhtml: true, paragraphTag: div ? 'div' : 'p' });
    const html = this.#sanitize(serializeHtml(this.state.doc));
    return div ? paragraphsAsDiv(html) : html;
  }

  getText(): string {
    return serializeText(this.state.doc);
  }

  get characterCount(): number {
    return characterCount(this.state.doc);
  }

  get isEmpty(): boolean {
    return isEmptyDoc(this.state.doc);
  }

  /** Replaces the document (controlled `value`, form reset, source view). */
  setHtml(html: string, options: { readonly addToHistory?: boolean } = {}): void {
    const doc = this.parseHtml(html);
    const tr = this.state.tr.replaceWith(0, this.state.doc.content.size, doc.content).setMeta(EXTERNAL, true);
    if (!options.addToHistory) tr.setMeta('addToHistory', false);
    this.dispatch(tr);
  }

  // -------------------------------------------------------------------------
  // Transactions and commands
  // -------------------------------------------------------------------------

  dispatch(tr: Transaction): void {
    if (this.view) this.view.dispatch(tr);
    else this.#apply(tr);
  }

  #apply(tr: Transaction): void {
    const next = this.state.apply(tr);
    if (next === this.state) return;
    this.state = next;
    this.view?.updateState(next);
    for (const listener of this.#listeners) listener(tr);
  }

  exec(command: Command): boolean {
    return command(this.state, (tr) => this.dispatch(tr), this.view ?? undefined);
  }

  /** Runs a command, an alias, an extension command or a UI action by id; `false` when cancelled or not applied. */
  run(id: string, ...args: unknown[]): unknown {
    const alias = ALIASES[id];
    const name = alias ? alias[0] : id;
    const callArgs = alias ? [...alias.slice(1), ...args] : args;
    const builtIn = (this.commands as unknown as Record<string, (...a: unknown[]) => unknown>)[name];
    const extension = this.extensionCommands[name];
    if (!builtIn && !extension) return this.#options.onAction?.(id, args) ?? false;
    if (this.#options.onBeforeCommand && this.#options.onBeforeCommand(id, callArgs) === false) return false;
    const result = builtIn ? builtIn(...callArgs) : this.exec(extension!(...(callArgs as never[])));
    this.#options.onCommand?.(id, callArgs, result !== false && result !== 0);
    return result;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getSelection(): RichTextSelection {
    const { anchor, head, from, to, empty } = this.state.selection;
    return { anchor, head, from, to, empty, text: this.state.doc.textBetween(from, to, '\n', '￼') };
  }

  setSelection(anchor: number, head = anchor): void {
    const max = this.state.doc.content.size;
    const clamp = (p: number) => Math.max(0, Math.min(max, p));
    this.dispatch(this.state.tr.setSelection(TextSelection.between(this.state.doc.resolve(clamp(anchor)), this.state.doc.resolve(clamp(head)))).scrollIntoView());
  }

  clearHistory(): void {
    // reconfigure() would keep the old history state (same plugin key): start a fresh state.
    const fresh = historyPlugin(this.#options);
    const plugins = this.state.plugins.map((p) => (p === this.#history ? fresh : p));
    this.#history = fresh;
    const next = EditorState.create({ doc: this.state.doc, selection: this.state.selection, plugins });
    this.state = next;
    this.view?.updateState(next);
    for (const listener of this.#listeners) listener(null);
  }

  get suggest(): SuggestState | null {
    return suggestKey.getState(this.state)?.active ?? null;
  }

  dismissSuggest(): void {
    this.dispatch(this.state.tr.setMeta(suggestKey, 'dismiss'));
  }

  /** Replaces the active trigger and query (`/head`, `:smi`) with content. */
  completeSuggest(content: string | null): void {
    const active = this.suggest;
    if (!active) return;
    const tr = this.state.tr.delete(active.from, active.to);
    if (content) tr.insertText(content);
    this.dispatch(tr);
  }

  get findState() {
    return findKey.getState(this.state);
  }

  get painterActive(): boolean {
    return Boolean(painterKey.getState(this.state));
  }

  // -------------------------------------------------------------------------
  // Uploads: pending until the onUpload promise settles
  // -------------------------------------------------------------------------

  async insertFiles(files: readonly File[], at?: number): Promise<void> {
    const upload = this.#options.upload?.();
    const jobs = files.map(async (file) => {
      const kind = /^image\//.test(file.type) ? 'image' : /^audio\//.test(file.type) ? 'audio' : /^video\//.test(file.type) ? 'video' : null;
      if (!kind) return;
      const id = `u${Math.random().toString(36).slice(2)}`;
      const pos = at ?? this.state.selection.from;
      this.dispatch(this.state.tr.setMeta(uploadKey, { add: { id, pos } }));
      const controller = new AbortController();
      this.#uploads.set(id, controller);
      try {
        let result: UploadResult;
        if (upload) result = await upload(file, { signal: controller.signal });
        else if (kind === 'image' && (this.#options.imageInsert?.() ?? 'blob') === 'base64') result = { src: await dataUrl(file) };
        else result = { src: URL.createObjectURL(file) };
        const target = findUpload(this.state, id);
        if (target === null || controller.signal.aborted) return;
        const { nodes } = this.schema;
        const node =
          kind === 'image'
            ? nodes['image']!.create({ src: result.src, alt: result.alt ?? file.name.replace(/\.[^.]+$/, '') })
            : nodes[kind]!.create({ src: result.src });
        const tr = this.state.tr.setMeta(uploadKey, { remove: id });
        tr.insert(target, kind === 'image' ? node : node);
        this.dispatch(tr);
      } catch (error) {
        this.dispatch(this.state.tr.setMeta(uploadKey, { remove: id }));
        this.#options.onUploadError?.(error, file);
      } finally {
        this.#uploads.delete(id);
      }
    });
    await Promise.all(jobs);
  }

  // -------------------------------------------------------------------------
  // View
  // -------------------------------------------------------------------------

  mount(element: HTMLElement): EditorView {
    const options = this.#options;
    const view = new EditorView(
      { mount: element },
      {
        state: this.state,
        dispatchTransaction: (tr) => this.#apply(tr),
        editable: () => options.editable?.() ?? true,
        attributes: () => options.attributes?.() ?? {},
        nodeViews: nodeViews({ codeLanguages: options.codeLanguages ?? (() => undefined), setLanguage: (lang) => this.commands.setCodeLanguage(lang) }),
        transformPastedHTML: (html) => {
          const mode = this.#pasteOverride ?? options.pasteMode?.() ?? 'clean';
          const clean = mode === 'keep' || mode === 'clean' ? (options.cleanPaste?.(html, mode) ?? html) : html;
          return this.#sanitize(clean);
        },
        handlePaste: (v, event) => {
          const data = event.clipboardData;
          if (!data) return false;
          const files = [...data.files].filter((f) => /^(image|audio|video)\//.test(f.type));
          if (files.length) {
            void this.insertFiles(files);
            return true;
          }
          if (this.#pasteOverride) return false;
          const mode = options.pasteMode?.() ?? 'clean';
          const html = data.getData('text/html');
          const text = data.getData('text/plain');
          if (mode === 'plainText' && html) {
            this.#pasteWith('plainText', () => v.pasteText(text));
            return true;
          }
          if (mode === 'prompt' && html && options.pastePrompt) {
            void options.pastePrompt().then((choice) => {
              if (!choice || v.isDestroyed) return;
              v.focus();
              this.#pasteWith(choice, () => (choice === 'plainText' ? v.pasteText(text) : v.pasteHTML(html)));
            });
            return true;
          }
          return false;
        },
        handleDrop: (v, event, _slice, moved) => {
          const files = [...((event as DragEvent).dataTransfer?.files ?? [])].filter((f) => /^(image|audio|video)\//.test(f.type));
          if (moved || !files.length) return false;
          const pos = v.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          event.preventDefault();
          void this.insertFiles(files, pos);
          return true;
        },
      },
    );
    this.view = view;
    return view;
  }

  #pasteWith(mode: PasteMode, paste: () => void): void {
    this.#pasteOverride = mode;
    try {
      paste();
    } finally {
      this.#pasteOverride = null;
    }
  }

  /** The `@salmonui/dropdowns/mention` editor target over this view; one per view. */
  get mentionTarget(): MentionEditorTarget | null {
    const view = this.view;
    if (!view) return null;
    if (this.#mention && this.#mention.element === view.dom) return this.#mention;
    const engine = this;
    this.#mention = {
      element: view.dom,
      getTextBeforeCaret: () => (view.editable ? textBeforeCaret(engine.state) : null),
      getCaretRect(offset) {
        const $from = engine.state.selection.$from;
        const pos = Math.min($from.start() + offset, $from.end());
        try {
          const rect = view.coordsAtPos(pos);
          return { left: rect.left, top: rect.top, bottom: rect.bottom };
        } catch {
          return null;
        }
      },
      insertMention(insertion: MentionEditorInsertion) {
        const $from = engine.state.selection.$from;
        const start = $from.start();
        const node = engine.schema.nodes['mention']!.create({ id: String(insertion.value), label: insertion.label, trigger: insertion.trigger });
        const suffix = insertion.suffix || ' ';
        const tr = engine.state.tr.replaceWith(start + insertion.start, start + insertion.end, Fragment.from([node, engine.schema.text(suffix)]));
        tr.setSelection(TextSelection.create(tr.doc, start + insertion.start + 1 + suffix.length));
        engine.dispatch(tr.scrollIntoView());
        view.focus();
      },
      subscribe(listener) {
        return engine.subscribe((tr) => {
          if (!tr || tr.docChanged || tr.selectionSet) listener();
        });
      },
    };
    return this.#mention;
  }

  focus(): void {
    this.view?.focus();
  }

  /** Refreshes decorations and editable state after option changes. */
  refresh(): void {
    if (this.view) this.view.setProps({});
    this.dispatch(this.state.tr.setMeta('salmonHighlight', true));
  }

  destroy(): void {
    for (const controller of this.#uploads.values()) controller.abort();
    this.view?.destroy();
    this.view = null;
    this.#listeners.clear();
  }

  /** Selection as a NodeSelection of an image, figure, audio, video or embed, if any. */
  selectedNode(): PMNode | null {
    const sel = this.state.selection;
    return sel instanceof NodeSelection ? sel.node : null;
  }

  sliceHtml(): string {
    const slice = this.state.selection.content();
    return serializeHtml(slice.content);
  }
}

/** `undoGroupDelay: 0` makes every transaction its own undo step. */
function historyPlugin(options: EngineOptions): Plugin {
  const delay = options.undoGroupDelay ?? 300;
  return history({ depth: options.undoLimit ?? 30, newGroupDelay: delay <= 0 ? -1 : delay });
}

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function engineSchema(options: EngineOptions): Schema {
  const extensions = options.extensions ?? [];
  return createSchema({
    embedHosts: options.embedHosts,
    nodes: Object.assign({}, ...extensions.map((e) => e.nodes ?? {})),
    marks: Object.assign({}, ...extensions.map((e) => e.marks ?? {})),
  });
}

/** Creates the engine; async plugin factories of extensions are awaited first. */
export async function createEngine(options: EngineOptions = {}): Promise<RichTextEngine> {
  const schema = engineSchema(options);
  let engine: RichTextEngine | null = null;
  const plugins: Plugin[] = [];
  const context = {
    schema,
    getState: () => {
      if (!engine) throw new Error('RichTextEditor: the engine state is not ready yet.');
      return engine.state;
    },
    getView: () => engine?.view ?? null,
  };
  for (const ext of options.extensions ?? []) if (ext.plugins) plugins.push(...(await ext.plugins(context)));
  engine = new RichTextEngine(options, plugins, schema);
  return engine;
}

/** Synchronous variant without async extension plugins (tests, value conversions). */
export function createEngineSync(options: EngineOptions = {}): RichTextEngine {
  return new RichTextEngine(options, []);
}
