'use client';

// Lazy chunk of MarkdownEditor: the link, image and table dialogs (APG
// Dialog, modal). A native <dialog> opened with showModal() gives the
// modality, focus containment and Escape; it is portaled out of the editor
// so its <form> never nests in the application's form. Loaded on first use.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Portal } from '@salmonui/core/internal/overlay';
import { imageMarkdown, linkMarkdown, tableMarkdown } from './commands.js';
import type { MarkdownEditorLocaleText, MarkdownUploadResult } from './types.js';

export type MarkdownDialogKind = 'link' | 'image' | 'table';

export interface MarkdownDialogProps {
  readonly kind: MarkdownDialogKind;
  readonly locale: MarkdownEditorLocaleText;
  /** The selected text: the link text or the image alt. */
  readonly selection: string;
  readonly container: Element | null;
  readonly dir: string;
  readonly onUpload?: ((file: File, options: { readonly signal: AbortSignal }) => PromiseLike<MarkdownUploadResult>) | undefined;
  /** `block` inserts on lines of its own (tables). */
  readonly onInsert: (markdown: string, block: boolean) => void;
  readonly onClose: () => void;
}

export default function MarkdownDialog(props: MarkdownDialogProps): ReactElement {
  return (
    <Portal container={props.container}>
      <DialogBody {...props} />
    </Portal>
  );
}

function DialogBody(props: MarkdownDialogProps): ReactElement {
  const { kind, locale, selection, onUpload, onInsert, onClose } = props;
  const ref = useRef<HTMLDialogElement | null>(null);
  const upload = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<string>('');
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState(selection);
  const id = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      // showModal focuses the first control; the dialog's main field takes focus instead.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  useEffect(() => () => upload.current?.abort(), []);
  const title = locale[kind];
  const field = (name: string, label: string, extra: Record<string, unknown> = {}) => (
    <label className="salmon-markdown-editor-dialog-field">
      <span>{label}</span>
      <input name={name} {...extra} />
    </label>
  );
  return (
    <dialog
      ref={ref}
      dir={props.dir}
      className="salmon-markdown-editor-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const get = (name: string): string => String(data.get(name) ?? '').trim();
          if (kind === 'link') {
            if (get('url')) onInsert(linkMarkdown(get('text'), get('url')), false);
          } else if (kind === 'image') {
            if (get('src')) onInsert(imageMarkdown(get('alt'), get('src')), false);
          } else {
            const header = (i: number): string => locale.tableHeader.replace('{0}', String(i + 1));
            onInsert(tableMarkdown(Number(get('rows')) || 2, Number(get('cols')) || 2, header), true);
          }
        }}
      >
        <h2 id={`${id}-title`} className="salmon-markdown-editor-dialog-title">
          {title}
        </h2>
        {kind === 'link' ? (
          <>
            {field('text', locale.linkText, { defaultValue: selection })}
            {field('url', locale.linkUrl, { type: 'url', required: true, 'data-autofocus': '' })}
          </>
        ) : kind === 'image' ? (
          <>
            {field('src', locale.imageUrl, { required: true, 'data-autofocus': '', value: src, onChange: (e: { target: { value: string } }) => setSrc(e.target.value) })}
            {field('alt', locale.imageAlt, { value: alt, onChange: (e: { target: { value: string } }) => setAlt(e.target.value) })}
            {onUpload
              ? field('file', locale.imageFile, {
                  type: 'file',
                  accept: 'image/*',
                  onChange: (e: { target: HTMLInputElement }) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    upload.current?.abort();
                    const controller = new AbortController();
                    upload.current = controller;
                    setStatus(locale.uploading);
                    Promise.resolve(onUpload(file, { signal: controller.signal })).then(
                      (result) => {
                        if (controller.signal.aborted) return;
                        setSrc(result.src);
                        if (result.alt !== undefined) setAlt(result.alt);
                        else if (!alt) setAlt(file.name);
                        setStatus('');
                      },
                      () => {
                        if (!controller.signal.aborted) setStatus(locale.uploadFailed);
                      },
                    );
                  },
                })
              : null}
            <p className="salmon-markdown-editor-dialog-status" role="status">
              {status}
            </p>
          </>
        ) : (
          <>
            {field('rows', locale.tableRows, { type: 'number', min: 1, max: 50, defaultValue: 2, required: true, 'data-autofocus': '' })}
            {field('cols', locale.tableColumns, { type: 'number', min: 1, max: 20, defaultValue: 2, required: true })}
          </>
        )}
        <div className="salmon-markdown-editor-dialog-actions">
          <Button type="submit" tone="primary" disabled={status === locale.uploading}>
            {locale.insert}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {locale.cancel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
