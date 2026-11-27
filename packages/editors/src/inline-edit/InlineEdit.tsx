'use client';

// InlineEdit. A small local
// state machine, not an engine store: idle -> editing -> (validating) ->
// (saving) -> idle | error. The draft exists only while editing; an idle
// InlineEdit renders a button (or a span and an edit button) and a hidden
// input with `name`. Popover mode mounts the editor in the shared overlay
// primitive after hydration; nothing transient lives in React state.

import { useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { NO_ERRORS } from '@salmonui/core/validation';
import { Button } from '@salmonui/buttons/button';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { focusFirst } from '@salmonui/core/internal/focus-scope';
import { portalScopeOf } from '@salmonui/core/internal/modal-host';
import { Overlay } from '@salmonui/core/internal/overlay';
import { pressSource } from '@salmonui/core/internal/press';
import { compileInlineValidation, runValidation } from './validate.js';
import type {
  InlineEditApi,
  InlineEditCancellable,
  InlineEditInputProps,
  InlineEditLocaleText,
  InlineEditProps,
  InlineEditRenderContext,
  InlineEditSource,
  InlineEditTrigger,
} from './types.js';

/** English defaults of `localeText`. */
export const INLINE_EDIT_DEFAULT_LOCALE_TEXT: InlineEditLocaleText = Object.freeze({
  save: 'Save',
  cancel: 'Cancel',
  edit: 'Edit',
  empty: 'Empty',
  saving: 'Saving',
  saveFailed: 'The value could not be saved.',
});

const isEmpty = (value: unknown): boolean => value === null || value === undefined || value === '';
const textOf = (value: unknown): string => (isEmpty(value) ? '' : String(value));
const cx = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(' ');

function cancellable<E extends object>(base: E): E & InlineEditCancellable {
  let prevented = false;
  return {
    ...base,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
}

const PENCIL = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <path d="M11.5 1.8 14.2 4.5 5.4 13.3 2 14l.7-3.4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

export function InlineEdit<T = string>(props: InlineEditProps<T>): ReactElement {
  const {
    value: valueProp,
    defaultValue,
    save: saveAction,
    mode = 'popover',
    trigger = 'click',
    blurAction = 'save',
    saveOnEnter = true,
    showActions = true,
    renderActions,
    validation,
    placeholder,
    renderPreview,
    label,
    editing: editingProp,
    defaultEditing,
    onEditingChange,
    disabled = false,
    name,
    popoverProps,
    className,
    style,
    classNames,
    styles,
    ref,
    children,
    onBeforeEditStart,
    onEditStart,
    onBeforeSave,
    onSave,
    onSaveError,
    onBeforeEditCancel,
    onEditCancel,
    onDraftChange,
    localeText,
    ...rest
  } = props;
  const locale = { ...INLINE_EDIT_DEFAULT_LOCALE_TEXT, ...useLocaleText('inlineEdit', localeText) };
  const [saved, setSaved] = useControllableState<T>(valueProp, (defaultValue ?? '') as T, undefined, 'InlineEdit value');
  const [editing, setEditing] = useControllableState(editingProp, defaultEditing ?? false, onEditingChange, 'InlineEdit editing');
  const [draft, setDraftState] = useState<{ readonly v: T } | null>(null);
  const [errors, setErrors] = useState<readonly string[]>(NO_ERRORS);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Where the popover mounts (the nearest theme scope) and its direction, read at start time.
  const [host, setHost] = useState<{ readonly container: Element | null; readonly dir: string } | null>(null);
  // An edit closed from outside (controlled `editing`) drops its draft.
  const [wasEditing, setWasEditing] = useState(editing);
  if (wasEditing !== editing) {
    setWasEditing(editing);
    if (!editing) {
      setDraftState(null);
      setErrors(NO_ERRORS);
      setSaveError(null);
      setPending(false);
    }
  }
  const validator = useMemo(() => compileInlineValidation(validation as never), [validation]);
  const current = draft ? draft.v : saved;

  const id = useId();
  const inputId = `${id}-input`;
  const errorId = `${id}-error`;
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<HTMLSpanElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const restoreFocus = useRef(false);
  const draftRef = useRef<{ readonly v: T } | null>(null);
  const pressInside = useRef(false);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  // Focus moves into the editor on start and back to the preview after save or cancel.
  useLayoutEffect(() => {
    if (editing) {
      const editor = editorRef.current;
      if (editor && !editor.contains(editor.ownerDocument.activeElement)) focusFirst(editor);
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      previewRef.current?.focus();
    }
  }, [editing]);

  // The latest draft for handlers: a field may emit in the same event that commits (NumberField clamps on blur).
  useLayoutEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Any press clears the flag first (document capture); the editor's capture handler sets it again.
  useEffect(() => {
    if (!editing) return;
    const doc = rootRef.current?.ownerDocument;
    if (!doc) return;
    const onPress = (): void => {
      pressInside.current = false;
    };
    doc.addEventListener('pointerdown', onPress, true);
    return () => doc.removeEventListener('pointerdown', onPress, true);
  }, [editing]);

  const setBusy = (next: boolean): void => {
    busy.current = next;
    setPending(next);
  };

  const finish = (reason: 'save' | 'cancel', source: InlineEditSource, trigger: InlineEditTrigger): void => {
    const editor = editorRef.current;
    const active = editor?.ownerDocument.activeElement;
    restoreFocus.current = trigger !== 'blur' && (!active || active === editor?.ownerDocument.body || Boolean(editor?.contains(active)));
    setDraftState(null);
    setErrors(NO_ERRORS);
    setSaveError(null);
    setEditing(false, Object.freeze({ source, reason }));
  };

  const startEdit = (source: InlineEditSource): void => {
    if (disabled || editing) return;
    if (onBeforeEditStart) {
      const event = cancellable({ source });
      onBeforeEditStart(event);
      if (event.defaultPrevented) return;
    }
    const root = rootRef.current;
    if (root && mode === 'popover') {
      setHost({ container: portalScopeOf(root), dir: root.ownerDocument.defaultView?.getComputedStyle(root).direction ?? 'ltr' });
    }
    setDraftState(null);
    setErrors(NO_ERRORS);
    setSaveError(null);
    setEditing(true, Object.freeze({ source, reason: 'start' as const }));
    onEditStart?.(Object.freeze({ source }));
  };

  const validateValue = async (value: T): Promise<readonly string[]> => {
    const result = runValidation(validator, value);
    if (!(result instanceof Promise)) return result;
    setBusy(true);
    try {
      return await result;
    } finally {
      setBusy(false);
    }
  };

  const commit = async (trigger: InlineEditTrigger, source: InlineEditSource): Promise<boolean> => {
    if (!editing || busy.current) return false;
    const value = draftRef.current ? draftRef.current.v : saved;
    const found = await validateValue(value);
    setErrors(found);
    if (found.length) return false;
    const base = { value, previousValue: saved, source, trigger };
    if (onBeforeSave) {
      const event = cancellable(base);
      onBeforeSave(event);
      if (event.defaultPrevented) return false;
    }
    if (saveAction) {
      const controller = new AbortController();
      abortRef.current = controller;
      setSaveError(null);
      setBusy(true);
      try {
        await saveAction(value, { signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) return false;
        abortRef.current = null;
        setBusy(false);
        // A rejection keeps the editor open with the error, announced politely.
        setSaveError(locale.saveFailed);
        onSaveError?.(Object.freeze({ value, error }));
        return false;
      }
      if (controller.signal.aborted) return false;
      abortRef.current = null;
      setBusy(false);
    }
    setSaved(value);
    finish('save', source, trigger);
    onSave?.(Object.freeze(base));
    return true;
  };

  const cancel = (trigger: InlineEditTrigger, source: InlineEditSource): void => {
    if (!editing) return;
    const base = { value: current, source, trigger };
    if (onBeforeEditCancel) {
      const event = cancellable(base);
      onBeforeEditCancel(event);
      if (event.defaultPrevented) return;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    finish('cancel', source, trigger);
    onEditCancel?.(Object.freeze(base));
  };

  const setValue = (next: T): void => {
    if (busy.current) return;
    const previousValue = draftRef.current ? draftRef.current.v : saved;
    draftRef.current = { v: next };
    setDraftState(draftRef.current);
    if (!Object.is(next, previousValue)) onDraftChange?.(Object.freeze({ value: next, previousValue }));
  };

  useImperativeHandle(ref, (): InlineEditApi => ({
    get element() {
      return rootRef.current;
    },
    startEdit: () => startEdit('api'),
    save: () => commit('api', 'api'),
    cancelEdit: () => cancel('api', 'api'),
    validate: async () => {
      const found = await validateValue(editing ? current : saved);
      if (editing) setErrors(found);
      return found;
    },
  }));

  const onEditorKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      // Escape inside a field's own overlay (it bubbles here through the portal) closes that overlay only.
      const overlay = (event.target as Element).closest('[data-salmon-overlay]');
      if (overlay && !overlay.contains(event.currentTarget)) return;
      event.preventDefault();
      cancel('escape', 'keyboard');
    }
  };
  const onEditorBlur = (event: FocusEvent<HTMLElement>): void => {
    const next = event.relatedTarget as Element | null;
    // Focus moving inside the editor, or into a popup the editor opened (a picker), is not a blur.
    if (busy.current || (next && (event.currentTarget.contains(next) || next.closest('[data-salmon-overlay]')))) return;
    if (!next && pressInside.current) {
      // A press on a non-focusable part of the editor or of a field's portaled popup drops focus
      // to the body. The edit continues, and focus comes back so Escape and Tab keep working.
      pressInside.current = false;
      const target = event.target as HTMLElement;
      const doc = target.ownerDocument;
      setTimeout(() => {
        if (doc.activeElement && doc.activeElement !== doc.body) return;
        if (target.isConnected) target.focus({ preventScroll: true });
        else if (editorRef.current) focusFirst(editorRef.current);
      }, 0);
      return;
    }
    if (blurAction === 'save') void commit('blur', 'pointer');
    else if (blurAction === 'cancel') cancel('blur', 'pointer');
  };

  const invalid = errors.length > 0;
  const inputProps: InlineEditInputProps = {
    id: inputId,
    value: textOf(current),
    onChange: (event) => setValue(event.target.value as T),
    onKeyDown: (event) => {
      if (event.key !== 'Enter' || !saveOnEnter || event.nativeEvent.isComposing) return;
      // A multiline editor keeps Enter for new lines and saves with Mod+Enter.
      if ((event.target as Element).tagName === 'TEXTAREA' && !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      void commit('enter', 'keyboard');
    },
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid || saveError ? errorId : undefined,
    'aria-label': label,
    readOnly: pending,
    autoFocus: true,
  };
  const context: InlineEditRenderContext<T> = {
    value: current,
    setValue,
    inputProps,
    save: () => void commit('api', 'api'),
    cancel: () => cancel('api', 'api'),
    pending,
    errors,
  };
  const actionContext = {
    save: () => void commit('actions', 'api'),
    cancel: () => cancel('actions', 'api'),
    pending,
  };

  const empty = isEmpty(saved);
  const shownPlaceholder = placeholder ?? locale.empty;
  const preview = renderPreview ? renderPreview({ value: saved, placeholder: shownPlaceholder }) : empty ? shownPlaceholder : textOf(saved);
  const popover = mode === 'popover';

  const editor = editing ? (
    <span
      ref={editorRef}
      className={cx('salmon-inline-edit-editor', classNames?.editor)}
      style={styles?.editor}
      aria-busy={pending || undefined}
      data-pending={pending ? '' : undefined}
      onKeyDown={onEditorKeyDown}
      onBlur={onEditorBlur}
      // React events bubble through portals, so these also see presses in a field's popup.
      onPointerDownCapture={() => {
        pressInside.current = true;
      }}
      onKeyDownCapture={() => {
        pressInside.current = false;
      }}
    >
      <span className="salmon-inline-edit-field">{children ? children(context) : <input type="text" className="salmon-inline-edit-input" {...inputProps} />}</span>
      {showActions ? (
        <span className={cx('salmon-inline-edit-actions', classNames?.actions)} style={styles?.actions}>
          {renderActions ? (
            renderActions(actionContext)
          ) : (
            <>
              <Button tone="primary" loading={pending} loadingLabel={locale.saving} onClick={(e: MouseEvent) => void commit('actions', pressSource(e))}>
                {locale.save}
              </Button>
              <Button variant="outline" onClick={(e: MouseEvent) => cancel('actions', pressSource(e))}>
                {locale.cancel}
              </Button>
            </>
          )}
        </span>
      ) : null}
      {invalid || saveError ? (
        <span id={errorId} className={cx('salmon-inline-edit-error', classNames?.error)} style={styles?.error}>
          {saveError ?? errors.join(' ')}
        </span>
      ) : null}
    </span>
  ) : null;

  let display: ReactNode = null;
  if (!editing || popover) {
    const previewClass = cx('salmon-inline-edit-preview', classNames?.preview);
    const expanded = popover && trigger !== 'editButton' ? editing : undefined;
    const editButton = (
      <Button
        ref={trigger === 'editButton' ? (previewRef as never) : undefined}
        className="salmon-inline-edit-edit-button"
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={label ? `${locale.edit} ${label}` : locale.edit}
        aria-haspopup={popover ? 'dialog' : undefined}
        aria-expanded={popover ? editing : undefined}
        disabled={disabled}
        // With trigger="doubleClick" the button shows only on coarse pointers (CSS).
        tabIndex={trigger === 'doubleClick' ? -1 : undefined}
        onClick={(e: MouseEvent) => startEdit(pressSource(e))}
      >
        {PENCIL}
      </Button>
    );
    display =
      trigger === 'editButton' ? (
        <>
          <span className={previewClass} style={styles?.preview} data-empty={empty ? '' : undefined}>
            {preview}
          </span>
          {editButton}
        </>
      ) : (
        <>
          <button
            ref={previewRef as never}
            type="button"
            className={previewClass}
            style={styles?.preview}
            data-empty={empty ? '' : undefined}
            aria-haspopup={popover ? 'dialog' : undefined}
            aria-expanded={expanded}
            aria-disabled={disabled || undefined}
            onClick={(e) => {
              if (disabled) return;
              const source = pressSource(e);
              // Double-click mode: a pointer click only focuses; Enter and Space (detail 0) start editing.
              if (trigger === 'click' || source === 'keyboard') startEdit(source);
            }}
            onDoubleClick={trigger === 'doubleClick' ? () => startEdit('pointer') : undefined}
          >
            {/* The accessible name joins the label and the visible value. */}
            {label ? <span className="salmon-inline-edit-label">{`${label}: `}</span> : null}
            {preview}
          </button>
          {trigger === 'doubleClick' ? editButton : null}
        </>
      );
  }

  return (
    <span
      {...rest}
      ref={rootRef}
      className={cx('salmon-inline-edit', className)}
      style={style}
      data-mode={mode}
      data-trigger={trigger}
      data-editing={editing ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
    >
      {name ? <input type="hidden" name={name} value={textOf(saved)} /> : null}
      {display}
      {editing && !popover ? editor : null}
      {editing && popover ? (
        <Overlay
          anchor={rootRef}
          container={host?.container}
          dir={host?.dir}
          role="dialog"
          aria-label={label ?? locale.edit}
          className="salmon-inline-edit-popover"
          placement={popoverProps?.placement ?? 'bottom-start'}
          offset={popoverProps?.offset ?? 4}
          focus={{ autoFocus: false, restoreFocus: false }}
        >
          {editor}
        </Overlay>
      ) : null}
      <span className="salmon-inline-edit-status" role="status">
        {pending ? locale.saving : (saveError ?? '')}
      </span>
    </span>
  );
}
