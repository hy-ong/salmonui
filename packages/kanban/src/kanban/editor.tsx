'use client';
// Kanban card editor, a lazy chunk loaded when `editing` opens. A
// native modal <dialog> (focus containment, Escape, top layer and inert
// background from the platform) with native form fields, behind this seam:
// Layout's `Dialog` and the Inputs fields replace the shell here once they
// are on main, without a change to the Kanban API. The draft lives in the
// form fields; only validation errors are React state.

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { formatKanbanText, type KanbanLocaleText } from './locale.js';
import type { KanbanEditorContext, KanbanEditorField } from './types.js';

export interface KanbanEditorProps {
  readonly text: KanbanLocaleText;
  readonly isNew: boolean;
  readonly card: unknown;
  readonly fields: readonly KanbanEditorField<unknown>[];
  readonly renderEditor: ((ctx: KanbanEditorContext<unknown>) => ReactNode) | undefined;
  onSave(next: unknown): void;
  onCancel(): void;
  onDelete(): void;
}

const valueOf = (card: unknown, field: string): unknown => (card !== null && typeof card === 'object' ? (card as Record<string, unknown>)[field] : undefined);

export default function KanbanEditor({ text, isNew, card, fields, renderEditor, onSave, onCancel, onDelete }: KanbanEditorProps): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const done = useRef(false);
  const cancel = useRef(onCancel);
  useEffect(() => {
    cancel.current = onCancel;
  });
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    done.current = false;
    if (!dialog.open) dialog.showModal?.();
    // The `close` event is queued: one left over from a previous run of this
    // effect (StrictMode remount) arrives while the dialog is open again.
    const onClose = (): void => {
      if (!done.current && !dialog.open) cancel.current();
    };
    dialog.addEventListener('close', onClose);
    return () => {
      dialog.removeEventListener('close', onClose);
      done.current = true;
      if (dialog.open) dialog.close();
    };
  }, []);
  const finish = (run: () => void): void => {
    done.current = true;
    run();
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = event.currentTarget;
    let next = { ...(card as object) } as Record<string, unknown>;
    for (const f of fields) {
      const el = form.elements.namedItem(f.field) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (!el) continue;
      const raw = el.value;
      let value: unknown = raw;
      if (f.kind === 'number') value = raw === '' ? null : Number(raw);
      else if (f.kind === 'select') value = f.options?.find((o) => String(o.value) === raw)?.value ?? raw;
      next = { ...next, [f.field]: value };
    }
    const found: Record<string, string> = {};
    for (const f of fields) {
      const v = next[f.field];
      if (f.required && (v === '' || v === null || v === undefined)) found[f.field] = formatKanbanText(text.required, { label: f.label });
      else {
        const message = f.validate?.(v, next);
        if (message) found[f.field] = message;
      }
    }
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      (form.elements.namedItem(first) as HTMLElement | null)?.focus();
      return;
    }
    finish(() => onSave(next));
  };

  const title = isNew ? text.newTitle : text.editTitle;
  return (
    <dialog ref={ref} className="salmon-kanban-editor" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="salmon-kanban-editor-title">
        {title}
      </h2>
      {renderEditor ? (
        renderEditor({
          card,
          isNew,
          save: (next) => finish(() => onSave(next)),
          cancel: () => finish(onCancel),
          delete: () => finish(isNew ? onCancel : onDelete),
        })
      ) : (
        <form className="salmon-kanban-editor-form" onSubmit={submit} noValidate>
          {fields.map((f) => {
            const fid = `${id}-field-${f.field}`;
            const err = errors[f.field];
            const current = valueOf(card, f.field);
            const common = {
              id: fid,
              name: f.field,
              defaultValue: current === undefined || current === null ? '' : String(current),
              'aria-invalid': err ? true : undefined,
              'aria-describedby': err ? `${fid}-error` : undefined,
              'aria-required': f.required || undefined,
              className: 'salmon-kanban-editor-input',
            } as const;
            return (
              <div key={f.field} className="salmon-kanban-editor-field">
                <label htmlFor={fid}>{f.label}</label>
                {f.kind === 'textarea' ? (
                  <textarea {...common} rows={3} />
                ) : f.kind === 'select' ? (
                  <select {...common}>
                    {(f.options ?? []).map((o) => (
                      <option key={String(o.value)} value={String(o.value)}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input {...common} type={f.kind === 'number' ? 'number' : 'text'} />
                )}
                {err ? (
                  <div id={`${fid}-error`} className="salmon-kanban-editor-error">
                    {err}
                  </div>
                ) : null}
              </div>
            );
          })}
          <div className="salmon-kanban-editor-actions">
            {!isNew ? (
              <button type="button" className="salmon-kanban-editor-button" data-variant="danger" onClick={() => finish(onDelete)}>
                {text.delete}
              </button>
            ) : null}
            <button type="button" className="salmon-kanban-editor-button" onClick={() => finish(onCancel)}>
              {text.cancel}
            </button>
            <button type="submit" className="salmon-kanban-editor-button" data-variant="primary">
              {text.save}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
