'use client';
// Lazy chunk of RichTextEditor (prompt, find and replace): dialogs and suggestion popups. Loaded
// with React.lazy the first time one opens; the emoji list is its own chunk.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Dialog, Popover } from './overlay.js';
import { format, type RichTextEditorLocaleText } from './locale.js';
import { plainTextToHtml } from '../html/index.js';
import type { EditorStore } from './store.js';
import type { RichTextAiAssistant, RichTextDialogId, RichTextEditorActions, RichTextEmoji } from './types.js';

export interface SuggestItem {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[] | undefined;
  readonly run: () => void;
}

export interface DialogsProps {
  readonly dialog: RichTextDialogId | null;
  /** The emoji picker (toolbar) or a trigger popup (`:` emoji, `/` slash). */
  readonly popup: 'emoji' | 'slash' | 'emojiTrigger' | null;
  readonly locale: RichTextEditorLocaleText;
  readonly actions: RichTextEditorActions;
  readonly store: EditorStore;
  readonly close: () => void;
  readonly closePopup: () => void;
  readonly anchor: () => { left: number; top: number; bottom: number } | null;
  readonly query: string;
  readonly slashItems: readonly SuggestItem[];
  readonly suggestKeys: { current: ((event: KeyboardEvent) => boolean) | null };
  readonly completeSuggest: (text: string | null) => void;
  readonly emojiList?: readonly RichTextEmoji[] | undefined;
  readonly onBrowseFiles?: ((kind: 'image' | 'audio' | 'video') => Promise<{ readonly src: string; readonly alt?: string } | null>) | undefined;
  readonly aiAssistant?: RichTextAiAssistant | undefined;
  readonly pasteChoice: (choice: 'keep' | 'clean' | 'plainText' | null) => void;
  /** The link at the selection (edit mode of the link dialog). */
  readonly linkHref: string | null;
  /** Attributes of the selected image (`editImage`), else null. */
  readonly imageAttrs: Readonly<Record<string, unknown>> | null;
}

function Field(props: { readonly label: string; readonly name: string; readonly type?: string; readonly defaultValue?: string | number | undefined; readonly autoFocus?: boolean; readonly invalid?: boolean }): ReactElement {
  const id = useId();
  return (
    <div className="salmon-rich-text__field">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        name={props.name}
        type={props.type ?? 'text'}
        defaultValue={props.defaultValue}
        data-autofocus={props.autoFocus ? '' : undefined}
        aria-invalid={props.invalid || undefined}
        min={props.type === 'number' ? 1 : undefined}
      />
    </div>
  );
}

function Check(props: { readonly label: string; readonly name: string; readonly defaultChecked?: boolean }): ReactElement {
  return (
    <label className="salmon-rich-text__check">
      <input type="checkbox" name={props.name} defaultChecked={props.defaultChecked} /> {props.label}
    </label>
  );
}

function Actions(props: { readonly locale: RichTextEditorLocaleText; readonly submit: string; readonly onCancel: () => void }): ReactElement {
  return (
    <div className="salmon-rich-text__dialog-actions">
      <Button variant="ghost" onClick={props.onCancel}>
        {props.locale.cancel}
      </Button>
      <Button type="submit" tone="primary">
        {props.submit}
      </Button>
    </div>
  );
}

const read = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  return new FormData(event.currentTarget);
};
const str = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
const num = (data: FormData, key: string) => {
  const n = parseInt(str(data, key), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function LinkDialog({ locale, actions, close, linkHref: snapshot }: DialogsProps): ReactElement {
  const [invalid, setInvalid] = useState(false);
  const [sel] = useState(() => actions.getSelection());
  return (
    <Dialog title={snapshot ? locale.editLink : locale.link} onClose={close}>
      <form
        onSubmit={(event) => {
          const data = read(event);
          const ok = actions.commands.setLink({ href: str(data, 'href'), text: str(data, 'text') || undefined, title: str(data, 'title') || undefined, target: data.get('blank') ? '_blank' : null });
          if (!ok) setInvalid(true);
          else close();
        }}
      >
        <Field label={locale.linkUrl} name="href" type="url" defaultValue={snapshot ?? ''} autoFocus invalid={invalid} />
        <Field label={locale.linkText} name="text" defaultValue={sel.text} />
        <Field label={locale.linkTitle} name="title" />
        <Check label={locale.linkNewWindow} name="blank" />
        <Actions locale={locale} submit={snapshot ? locale.update : locale.insert} onCancel={close} />
      </form>
    </Dialog>
  );
}

function ImageDialog({ locale, actions, close, onBrowseFiles, imageAttrs: current }: DialogsProps): ReactElement {
  const form = useRef<HTMLFormElement | null>(null);
  const editImage = current !== null;
  const value = (k: string) => (current?.[k] as string | number | null | undefined) ?? undefined;
  return (
    <Dialog title={editImage ? locale.editImage : locale.image} onClose={close}>
      <form
        ref={form}
        onSubmit={(event) => {
          const data = read(event);
          const file = data.get('file');
          if (file instanceof File && file.size) {
            close();
            void actions.insertFiles([file]);
            return;
          }
          const src = str(data, 'src');
          if (!src) return;
          const image = { src, alt: str(data, 'alt'), width: num(data, 'width'), height: num(data, 'height') };
          if (editImage) actions.commands.updateImage(image);
          else actions.commands.insertImage({ ...image, caption: str(data, 'caption') || undefined });
          close();
        }}
      >
        <Field label={locale.imageUrl} name="src" defaultValue={value('src')} autoFocus />
        <Field label={locale.imageAlt} name="alt" defaultValue={value('alt')} />
        {editImage ? null : <Field label={locale.imageCaption} name="caption" />}
        <div className="salmon-rich-text__row">
          <Field label={locale.width} name="width" type="number" defaultValue={value('width')} />
          <Field label={locale.height} name="height" type="number" defaultValue={value('height')} />
        </div>
        {editImage ? null : <FileRow locale={locale} accept="image/*" kind="image" onBrowseFiles={onBrowseFiles} form={form} />}
        <Actions locale={locale} submit={editImage ? locale.update : locale.insert} onCancel={close} />
      </form>
    </Dialog>
  );
}

function FileRow(props: {
  readonly locale: RichTextEditorLocaleText;
  readonly accept: string;
  readonly kind: 'image' | 'audio' | 'video';
  readonly onBrowseFiles: DialogsProps['onBrowseFiles'];
  readonly form: { current: HTMLFormElement | null };
}): ReactElement {
  const id = useId();
  return (
    <div className="salmon-rich-text__field">
      <label htmlFor={id}>{props.locale.uploadFile}</label>
      <input id={id} type="file" name="file" accept={props.accept} />
      {props.onBrowseFiles ? (
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const picked = await props.onBrowseFiles!(props.kind);
            const form = props.form.current;
            if (!picked || !form) return;
            (form.elements.namedItem('src') as HTMLInputElement).value = picked.src;
            const alt = form.elements.namedItem('alt') as HTMLInputElement | null;
            if (alt && picked.alt) alt.value = picked.alt;
          }}
        >
          {props.locale.browseFiles}
        </Button>
      ) : null}
    </div>
  );
}

function MediaDialog(props: DialogsProps & { readonly kind: 'audio' | 'video' | 'embed' }): ReactElement {
  const { locale, actions, close, kind, onBrowseFiles } = props;
  const form = useRef<HTMLFormElement | null>(null);
  return (
    <Dialog title={locale[kind]} onClose={close}>
      <form
        ref={form}
        onSubmit={(event) => {
          const data = read(event);
          const file = data.get('file');
          if (file instanceof File && file.size) {
            close();
            void actions.insertFiles([file]);
            return;
          }
          const src = str(data, 'src');
          if (!src) return;
          const media = { src, width: num(data, 'width'), height: num(data, 'height') };
          if (kind === 'audio') actions.commands.insertAudio(media);
          else if (kind === 'video') actions.commands.insertVideo(media);
          else actions.commands.insertEmbed(media);
          close();
        }}
      >
        <Field label={locale.mediaUrl} name="src" type="url" autoFocus />
        {kind === 'audio' ? null : (
          <div className="salmon-rich-text__row">
            <Field label={locale.width} name="width" type="number" />
            <Field label={locale.height} name="height" type="number" />
          </div>
        )}
        {kind === 'embed' ? null : <FileRow locale={locale} accept={`${kind}/*`} kind={kind} onBrowseFiles={onBrowseFiles} form={form} />}
        <Actions locale={locale} submit={locale.insert} onCancel={close} />
      </form>
    </Dialog>
  );
}

function TableDialog({ locale, actions, close }: DialogsProps): ReactElement {
  return (
    <Dialog title={locale.table} onClose={close}>
      <form
        onSubmit={(event) => {
          const data = read(event);
          actions.commands.insertTable({ rows: num(data, 'rows') ?? 3, cols: num(data, 'cols') ?? 3, headerRow: Boolean(data.get('header')) });
          close();
        }}
      >
        <div className="salmon-rich-text__row">
          <Field label={locale.rows} name="rows" type="number" defaultValue={3} autoFocus />
          <Field label={locale.columns} name="cols" type="number" defaultValue={3} />
        </div>
        <Check label={locale.headerRow} name="header" defaultChecked />
        <Actions locale={locale} submit={locale.insert} onCancel={close} />
      </form>
    </Dialog>
  );
}

function FindDialog({ locale, actions, close, store }: DialogsProps): ReactElement {
  const [status, setStatus] = useState('');
  const form = useRef<HTMLFormElement | null>(null);
  const refresh = () => {
    const s = store.get();
    setStatus(s.findCount ? format(locale.matches, { index: s.findIndex + 1, count: s.findCount }) : locale.noMatches);
  };
  const search = () => {
    const f = form.current!;
    const value = (f.elements.namedItem('find') as HTMLInputElement).value;
    actions.commands.find(value, { matchCase: (f.elements.namedItem('case') as HTMLInputElement).checked, wholeWord: (f.elements.namedItem('word') as HTMLInputElement).checked });
    refresh();
  };
  const replacement = () => (form.current!.elements.namedItem('replace') as HTMLInputElement).value;
  useEffect(() => () => void actions.commands.clearFind(), [actions]);
  return (
    <Dialog title={locale.findReplace} onClose={close} className="salmon-rich-text__dialog--find">
      <form
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          actions.commands.findNext();
          refresh();
        }}
        onChange={(event) => {
          if ((event.target as unknown as HTMLInputElement).name !== 'replace') search();
        }}
      >
        <Field label={locale.find} name="find" autoFocus />
        <Field label={locale.replaceWith} name="replace" />
        <div className="salmon-rich-text__row">
          <Check label={locale.matchCase} name="case" />
          <Check label={locale.wholeWord} name="word" />
        </div>
        <p className="salmon-rich-text__status-line" role="status">
          {status}
        </p>
        <div className="salmon-rich-text__dialog-actions">
          <Button variant="ghost" onClick={() => (actions.commands.findPrevious(), refresh())}>
            {locale.findPrevious}
          </Button>
          <Button type="submit">{locale.findNext}</Button>
          <Button onClick={() => (actions.commands.replace(replacement()), refresh())}>{locale.replace}</Button>
          <Button onClick={() => (actions.commands.replaceAll(replacement()), refresh())}>{locale.replaceAll}</Button>
          <Button variant="ghost" onClick={close}>
            {locale.close}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PastePrompt({ locale, pasteChoice }: DialogsProps): ReactElement {
  return (
    <Dialog title={locale.pastePrompt} onClose={() => pasteChoice(null)}>
      <div className="salmon-rich-text__dialog-actions">
        <Button onClick={() => pasteChoice('keep')}>{locale.pasteKeep}</Button>
        <Button tone="primary" onClick={() => pasteChoice('clean')}>
          {locale.pasteClean}
        </Button>
        <Button onClick={() => pasteChoice('plainText')}>{locale.pastePlain}</Button>
      </div>
    </Dialog>
  );
}

function AiDialog({ locale, actions, close, aiAssistant }: DialogsProps): ReactElement {
  const [output, setOutput] = useState('');
  const [phase, setPhase] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const abort = useRef<AbortController | null>(null);
  const promptId = useId();
  useEffect(() => () => abort.current?.abort(), []);
  const generate = async (prompt: string) => {
    if (!aiAssistant || !prompt) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setOutput('');
    setPhase('working');
    try {
      const result = aiAssistant.onRequest({ prompt, selectionHtml: actions.getSelection().empty ? '' : actions.engine.sliceHtml(), signal: controller.signal });
      if (typeof (result as AsyncIterable<string>)[Symbol.asyncIterator] === 'function') {
        let text = '';
        for await (const chunk of result as AsyncIterable<string>) {
          if (controller.signal.aborted) return;
          text += chunk;
          setOutput(text);
        }
      } else setOutput(await (result as Promise<string>));
      if (!controller.signal.aborted) setPhase('done');
    } catch {
      if (!controller.signal.aborted) setPhase('error');
    }
  };
  return (
    <Dialog title={locale.aiAssistant} onClose={close}>
      <form
        onSubmit={(event) => {
          void generate(str(read(event), 'prompt'));
        }}
      >
        <div className="salmon-rich-text__field">
          <label htmlFor={promptId}>{locale.aiPrompt}</label>
          <textarea id={promptId} name="prompt" rows={3} data-autofocus="" />
        </div>
        <div className="salmon-rich-text__ai-output" aria-live="polite" aria-busy={phase === 'working'} data-phase={phase}>
          {phase === 'error' ? locale.aiError : output || (phase === 'working' ? locale.aiWorking : '')}
        </div>
        <div className="salmon-rich-text__dialog-actions">
          <Button variant="ghost" onClick={close}>
            {locale.aiDiscard}
          </Button>
          <Button type="submit" loading={phase === 'working'} loadingLabel={locale.aiWorking}>
            {locale.aiGenerate}
          </Button>
          <Button
            tone="primary"
            disabled={phase !== 'done' || !output}
            onClick={() => {
              // Model output is text: escaped into paragraphs, never parsed as HTML.
              actions.commands.insertHtml(plainTextToHtml(output));
              close();
            }}
          >
            {locale.aiAccept}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Suggestion popups: slash menu, `:` emoji and the emoji picker
// ---------------------------------------------------------------------------

function useEmoji(list: readonly RichTextEmoji[] | undefined): readonly RichTextEmoji[] {
  const [loaded, setLoaded] = useState<readonly RichTextEmoji[] | null>(null);
  useEffect(() => {
    if (list) return;
    let live = true;
    void import('./emoji-data.js').then((m) => live && setLoaded(m.EMOJI));
    return () => {
      live = false;
    };
  }, [list]);
  return list ?? loaded ?? [];
}

const matches = (query: string, label: string, keywords: readonly string[] = []) => {
  const q = query.toLowerCase();
  return !q || label.toLowerCase().includes(q) || keywords.some((k) => k.toLowerCase().startsWith(q));
};

function OptionList(props: {
  readonly id: string;
  readonly label: string;
  readonly options: readonly { id: string; label: string; display?: string }[];
  readonly active: number;
  readonly onPick: (index: number) => void;
  readonly empty: string;
  readonly grid?: boolean;
}): ReactElement {
  return (
    // Trigger lists show at most 8 options (no scrolling, focus stays in the editor); the picker grid
    // scrolls and is focusable (axe scrollable-region-focusable).
    <div id={props.id} role="listbox" aria-label={props.label} tabIndex={props.grid ? 0 : undefined} className={props.grid ? 'salmon-rich-text__options salmon-rich-text__options--grid' : 'salmon-rich-text__options'}>
      {props.options.length === 0 ? <div className="salmon-rich-text__empty">{props.empty}</div> : null}
      {props.options.map((option, i) => (
        <div
          key={option.id}
          id={`${props.id}-${i}`}
          role="option"
          aria-selected={i === props.active}
          title={props.grid ? option.label : undefined}
          className="salmon-rich-text__option"
          onMouseDown={(event) => {
            event.preventDefault();
            props.onPick(i);
          }}
        >
          {props.grid ? (
            // The emoji is decoration; the name is the option's text.
            <>
              <span aria-hidden="true">{option.display}</span>
              <span className="salmon-rich-text__sr">{option.label}</span>
            </>
          ) : (
            (option.display ?? option.label)
          )}
        </div>
      ))}
    </div>
  );
}

/** Popup on a `/` or `:` trigger; keys arrive from the editor's key handler. */
function SuggestPopup(props: DialogsProps): ReactElement {
  const { popup, query, locale, slashItems, suggestKeys, completeSuggest } = props;
  const emoji = useEmoji(props.emojiList);
  const listId = useId();
  const [active, setActive] = useState(0);
  const options =
    popup === 'slash'
      ? slashItems
          .filter((item) => matches(query, item.label, item.keywords ?? [item.id]))
          .slice(0, 8)
          .map((item) => ({ id: item.id, label: item.label, run: item.run }))
      : emoji
          .filter((e) => matches(query, e.name, e.keywords))
          .slice(0, 8)
          .map((e) => ({ id: e.name, label: e.name, display: `${e.emoji} :${e.name}:`, run: () => completeSuggest(e.emoji) }));
  const clamped = Math.min(active, Math.max(0, options.length - 1));
  const pick = (i: number) => {
    const option = options[i];
    if (!option) return;
    if (popup === 'slash') {
      completeSuggest(null);
      option.run();
    } else option.run();
  };
  useEffect(() => {
    suggestKeys.current = (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((a) => (Math.min(a, options.length - 1) + step + options.length) % Math.max(1, options.length));
        return true;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && options.length) {
        pick(clamped);
        return true;
      }
      if (event.key === 'Escape') {
        props.closePopup();
        return true;
      }
      return false;
    };
    return () => {
      suggestKeys.current = null;
    };
  });
  useEffect(() => setActive(0), [query]);
  // The editor (combobox-like) points at the active option.
  useEffect(() => {
    const el = props.actions.engine.view?.dom;
    if (!el) return;
    el.setAttribute('aria-controls', listId);
    el.setAttribute('aria-activedescendant', options.length ? `${listId}-${clamped}` : '');
    return () => {
      el.removeAttribute('aria-controls');
      el.removeAttribute('aria-activedescendant');
    };
  });
  return (
    <Popover anchor={props.anchor} subscribe={props.store.subscribe} className="salmon-rich-text__popup" data-popup={popup ?? ''}>
      <OptionList id={listId} label={popup === 'slash' ? locale.slashMenu : locale.emoji} options={options} active={clamped} onPick={pick} empty={locale.noEmoji} />
    </Popover>
  );
}

/** The toolbar emoji picker: search field, grid listbox, arrow keys. */
function EmojiPicker(props: DialogsProps): ReactElement {
  const { locale, actions, closePopup } = props;
  const emoji = useEmoji(props.emojiList);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const options = emoji.filter((e) => matches(query, e.name, e.keywords)).map((e) => ({ id: e.name, label: e.name, display: e.emoji, emoji: e.emoji }));
  const clamped = Math.min(active, Math.max(0, options.length - 1));
  const pick = (i: number) => {
    const option = options[i];
    if (!option) return;
    closePopup();
    actions.focus();
    actions.commands.insertText(option.emoji);
  };
  const COLS = 8;
  const searchRef = useRef<HTMLInputElement | null>(null);
  // After the popover is placed (a hidden element cannot take focus).
  useEffect(() => searchRef.current?.focus(), []);
  return (
    <Popover anchor={props.anchor} subscribe={props.store.subscribe} className="salmon-rich-text__popup salmon-rich-text__emoji" data-popup="emoji" role="dialog" aria-label={locale.emoji}>
      <input
        className="salmon-rich-text__emoji-search"
        type="search"
        role="combobox"
        aria-label={locale.emojiSearch}
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={options.length ? `${listId}-${clamped}` : undefined}
        ref={searchRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[event.key];
          if (step !== undefined && options.length) {
            event.preventDefault();
            setActive(Math.max(0, Math.min(options.length - 1, clamped + step)));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            pick(clamped);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            closePopup();
            actions.focus();
          }
        }}
      />
      <OptionList id={listId} label={locale.emoji} options={options} active={clamped} onPick={pick} empty={locale.noEmoji} grid />
    </Popover>
  );
}

export default function Dialogs(props: DialogsProps): ReactElement | null {
  const { dialog, popup } = props;
  return (
    <>
      {dialog === 'link' ? <LinkDialog {...props} /> : null}
      {dialog === 'image' ? <ImageDialog {...props} /> : null}
      {dialog === 'audio' || dialog === 'video' || dialog === 'embed' ? <MediaDialog {...props} kind={dialog} /> : null}
      {dialog === 'table' ? <TableDialog {...props} /> : null}
      {dialog === 'findReplace' ? <FindDialog {...props} /> : null}
      {dialog === 'pastePrompt' ? <PastePrompt {...props} /> : null}
      {dialog === 'aiAssistant' ? <AiDialog {...props} /> : null}
      {popup === 'emoji' ? <EmojiPicker {...props} /> : null}
      {popup === 'slash' || popup === 'emojiTrigger' ? <SuggestPopup {...props} /> : null}
    </>
  );
}
