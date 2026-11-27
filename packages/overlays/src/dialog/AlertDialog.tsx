'use client';

// AlertDialog, DialogProvider, useConfirm, useAlert (APG Alert and Message Dialogs). AlertDialog is
// the Dialog host with role="alertdialog", no backdrop dismissal and initial
// focus on the least destructive action. It composes `Button` (the Buttons
// family's public entry). The provider keeps its queue in its own state (one
// per provider instance); there is no library-owned global.

import { createContext, use, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DialogBody, DialogDescription, DialogFooter, DialogTitle, useOpenRequest, type DialogProps } from '@salmonui/core/internal/dialog-core/Dialog';
import { DialogBase } from './Dialog.js';
import { useLocaleText } from '@salmonui/core/internal/locale';

export interface AlertDialogLocaleText {
  /** Confirm label without `confirmLabel`. Default `"OK"`. */
  readonly ok?: string | undefined;
  /** Cancel label without `cancelLabel` (only used when `onCancel` or a cancel label exists). Default `"Cancel"`. */
  readonly cancel?: string | undefined;
  /** Error text after a rejected `onConfirm` whose reason is not an `Error` with a message. Default `"Something went wrong. Try again."`. */
  readonly error?: string | undefined;
}

export interface AlertDialogProps extends Omit<DialogProps, 'title' | 'dismissible' | 'trigger' | 'children' | 'localeText'> {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Form fields (a prompt): the body and actions become a `<form>`; submitting it (Enter or the confirm button) calls `onConfirm(formData)`. */
  readonly children?: ReactNode;
  readonly trigger?: ReactNode;
  readonly confirmLabel?: ReactNode;
  /** Without a cancel label (and without `localeText.cancel` plus `onCancel`) the dialog is an alert with one action. */
  readonly cancelLabel?: ReactNode;
  readonly confirmIcon?: ReactNode;
  readonly cancelIcon?: ReactNode;
  /** `'danger'` styles the confirm button for destructive actions. */
  readonly tone?: 'primary' | 'danger' | undefined;
  /**
   * May return a promise: the confirm button shows its loading state and the
   * dialog stays open until it settles. While pending, Cancel is disabled and
   * Escape and the close button are ignored. A rejection keeps the dialog open
   * and shows the reason's `Error` message (else `localeText.error`) in a
   * `role="alert"` region above the actions; confirming again clears it.
   */
  readonly onConfirm?: ((formData: FormData | undefined) => unknown) | undefined;
  readonly onCancel?: (() => void) | undefined;
  /** Escape cancels. Default true. */
  readonly dismissible?: boolean | undefined;
  readonly localeText?: AlertDialogLocaleText | undefined;
}

/** A confirm, alert or prompt dialog (`role="alertdialog"`, `.salmon-dialog[data-kind="alert"]`). */
export function AlertDialog(props: AlertDialogProps): ReactElement {
  const { title, description, children, confirmLabel, cancelLabel, confirmIcon, cancelIcon, tone = 'primary', onConfirm, onCancel, dismissible = true, localeText: ownText, ...rest } = props;
  const localeText = useLocaleText('alertDialog', ownText);
  // The open triad straight from props; the root below overrides `open` and `onOpenChange`.
  const [open, request] = useOpenRequest(props);
  // `true` while an async confirm is pending, the error text after it rejected.
  const [pending, setPending] = useState<true | string | null>(null);
  const busy = pending === true;
  const hasCancel = cancelLabel !== undefined || onCancel !== undefined;
  const confirm = (data: FormData | undefined): void => {
    if (busy) return;
    const result = onConfirm?.(data) as Promise<unknown> | undefined;
    if (!result?.then) return request(false, 'confirm', 'api');
    setPending(true);
    result.then(
      () => (setPending(null), request(false, 'confirm', 'api')),
      (reason: unknown) => setPending((reason instanceof Error && reason.message) || localeText?.error || 'Something went wrong. Try again.'),
    );
  };
  const cancel = (): void => {
    onCancel?.();
    setPending(null);
    request(false, 'cancel', 'api');
  };
  const actions = (
    <>
      {typeof pending === 'string' ? (
        <div className="salmon-alert-dialog-error" role="alert">
          {pending}
        </div>
      ) : null}
      <DialogFooter>
        {hasCancel ? (
          <Button variant="outline" data-autofocus="" iconStart={cancelIcon} onClick={cancel} disabled={busy}>
            {cancelLabel ?? localeText?.cancel ?? 'Cancel'}
          </Button>
        ) : null}
        <Button tone={tone} type={children ? 'submit' : 'button'} iconStart={confirmIcon} loading={busy} data-autofocus={hasCancel ? undefined : ''} onClick={children ? undefined : () => confirm(undefined)}>
          {confirmLabel ?? localeText?.ok ?? 'OK'}
        </Button>
      </DialogFooter>
    </>
  );
  return (
    <DialogBase
      {...rest}
      kind="alert"
      open={open}
      dismissible={{ escape: dismissible, outside: false }}
      onOpenChange={(next, e) => {
        // Escape (and any other host request) is a cancel; the root stays controlled by this component.
        // A pending confirm ignores Escape and the close button.
        e.preventDefault();
        if (busy) return;
        setPending(null);
        if (!next) onCancel?.();
        request(next, e.reason, e.source);
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      {description === undefined ? null : <DialogDescription>{description}</DialogDescription>}
      {children ? (
        <form
          className="salmon-dialog-form"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            confirm(new FormData(e.currentTarget));
          }}
        >
          <DialogBody>{children}</DialogBody>
          {actions}
        </form>
      ) : (
        actions
      )}
    </DialogBase>
  );
}

/** Options of `useConfirm()` / `useAlert()`. */
export interface ConfirmOptions extends Pick<AlertDialogProps, 'title' | 'description' | 'confirmLabel' | 'cancelLabel' | 'tone' | 'confirmIcon' | 'cancelIcon' | 'localeText' | 'className' | 'style'> {
  /** Aborting closes the dialog; the promise resolves `false` (confirm) or `undefined` (alert). */
  readonly signal?: AbortSignal | undefined;
  /**
   * Runs on confirm before the dialog closes. A returned promise keeps it open
   * with a loading confirm button until it settles: fulfilled, the call resolves
   * `true`; rejected, the error shows in the dialog (as on `AlertDialog`) and
   * Cancel still resolves `false`.
   */
  readonly onConfirm?: (() => unknown) | undefined;
}

interface Entry {
  readonly id: number;
  readonly kind: 'confirm' | 'alert';
  readonly options: ConfirmOptions;
  readonly resolve: (value: boolean) => void;
}

interface Queue {
  push(kind: Entry['kind'], options: ConfirmOptions): Promise<boolean>;
}

const QueueContext = createContext<Queue | null>(null);

/**
 * Hosts the dialogs of `useConfirm()` / `useAlert()` below it: a queue in
 * its own state, at most one alert dialog at a time, nothing on the server.
 */
export function DialogProvider(props: { readonly children?: ReactNode }): ReactElement {
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  const [seq] = useState(() => ({ n: 0 }));
  const [queue] = useState<Queue>(() => ({
    push(kind, options) {
      return new Promise<boolean>((resolve) => {
        const id = ++seq.n;
        const done = (value: boolean): void => {
          setEntries((list) => list.filter((e) => e.id !== id));
          resolve(value);
        };
        if (options.signal?.aborted) return resolve(false);
        options.signal?.addEventListener('abort', () => done(false), { once: true });
        setEntries((list) => [...list, { id, kind, options, resolve: done }]);
      });
    },
  }));
  const current = entries[0];
  return (
    <QueueContext value={queue}>
      {props.children}
      {current ? (
        <AlertDialog
          key={current.id}
          {...current.options}
          defaultOpen
          cancelLabel={current.kind === 'confirm' ? current.options.cancelLabel : undefined}
          onConfirm={() => {
            const result = current.options.onConfirm?.() as Promise<unknown> | undefined;
            if (!result?.then) return current.resolve(true);
            return result.then(() => current.resolve(true));
          }}
          onCancel={() => current.resolve(false)}
        />
      ) : null}
    </QueueContext>
  );
}

function useQueue(name: string): Queue {
  const queue = use(QueueContext);
  if (!queue) throw new Error(`[salmonui] ${name}() needs a <DialogProvider> above it.`);
  return queue;
}

/** `await confirm({ title, description, tone })`: true on confirm, false on cancel, Escape or abort. */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const queue = useQueue('useConfirm');
  return (options) => queue.push('confirm', options);
}

/** `await alert({ title, description })`: resolves when the user acknowledges (or on abort). */
export function useAlert(): (options: ConfirmOptions) => Promise<void> {
  const queue = useQueue('useAlert');
  return (options) => queue.push('alert', options).then(() => undefined);
}
