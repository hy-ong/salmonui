'use client';

// InlineAssist: a prompt anchored to an editor element, a text range or a
// point, with a slash command menu (the Buttons `Menu`), an adapter that
// streams the response and response actions. APG non-modal dialog: focus
// moves into the prompt on open and returns to the editor on close, Tab is
// not contained, Escape and an outside press close it (popover mode).
//
// State: the open, prompt and history triads are React state (they change on
// user actions only); the streamed text lives in the per-instance store and
// is published once per animation frame. Without `renderContent` the
// streaming text is appended to a text node outside React (no commit per
// chunk). The server renders nothing (the assist opens on the client).

import { createContext, use, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type HTMLAttributes, type KeyboardEvent, type ReactElement, type ReactNode, type RefObject } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Menu, type MenuItemData } from '@salmonui/buttons/menu';
import { SpeechToTextButton, type SpeechToTextButtonProps } from '@salmonui/inputs/speech-to-text';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocaleText } from '@salmonui/core/internal/locale';
import type { DismissReason } from '@salmonui/core/internal/dismiss';
import { useFocusScope, type FocusScopeOptions } from '@salmonui/core/internal/focus-scope';
import { liveRegionProps, announce } from '@salmonui/core/internal/live-region';
import { Overlay, useHydrated, type OverlayAnchor } from '@salmonui/core/internal/overlay';
import { pointRect } from '@salmonui/core/internal/position';
import { runStream, type StreamBuffer } from '../internal/stream-run.js';
import { buildRequest, cancelable, commandQuery, commitMessage, createAssistStore, filterCommands, INLINE_ASSIST_DEFAULT_LOCALE_TEXT, isPoint, isRange, mergeTranscript, selectionText, type AssistStore } from './model.js';
import type {
  InlineAssistAnchor,
  InlineAssistApi,
  InlineAssistCommand,
  InlineAssistInputProps,
  InlineAssistLocaleText,
  InlineAssistMessage,
  InlineAssistMessagesChangeEvent,
  InlineAssistOpenChangeReason,
  InlineAssistProps,
  InlineAssistResponseAction,
} from './types.js';

const EMPTY_MESSAGES: readonly InlineAssistMessage[] = Object.freeze([]);
const EMPTY_COMMANDS: readonly InlineAssistCommand[] = Object.freeze([]);
const DEFAULT_ACTIONS: readonly InlineAssistResponseAction[] = Object.freeze(['accept', 'discard', 'retry'] as const);
const EDITABLE = 'textarea, input, select, [contenteditable]:not([contenteditable="false"]), [tabindex], a[href], button';

const cx = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);

/** The latest value, readable from stable callbacks (written after commit). */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** The element of an anchor (an element, a ref, or the node a range starts in). Event time only. */
function anchorElement(anchor: InlineAssistAnchor | null | undefined): Element | null {
  if (!anchor || isPoint(anchor)) return null;
  if (isRange(anchor)) {
    const node = anchor.startContainer;
    return node.nodeType === 1 ? (node as Element) : node.parentElement;
  }
  if ('current' in anchor) return anchor.current;
  return anchor as Element;
}

/** The editor focus returns to: the focusable element at or around the anchor. Event time only. */
function editorOf(anchor: InlineAssistAnchor | null | undefined): HTMLElement | null {
  return (anchorElement(anchor)?.closest(EDITABLE) as HTMLElement | null) ?? null;
}

interface AssistContextValue {
  readonly text: Required<InlineAssistLocaleText>;
  readonly getValue: () => string;
  readonly setValue: (value: string) => void;
}

const AssistContext = createContext<AssistContextValue | null>(null);

export function InlineAssist(props: InlineAssistProps): ReactElement | null {
  const { mode = 'popover', open: openProp, defaultOpen, onOpenChange, ref } = props;
  const localeText = useLocaleText('inlineAssist', props.localeText);
  const notifyOpen = onOpenChange && ((next: boolean, reason: InlineAssistOpenChangeReason) => onOpenChange(next, Object.freeze({ reason })));
  const [openState, setOpen] = useControllableState<boolean, [InlineAssistOpenChangeReason]>(openProp, defaultOpen ?? false, notifyOpen, 'InlineAssist open');
  const [value, setValue] = useControllableState(props.value, props.defaultValue ?? '', props.onValueChange, 'InlineAssist value');
  const [messages, setMessages] = useControllableState<readonly InlineAssistMessage[], [InlineAssistMessagesChangeEvent]>(props.messages, props.defaultMessages ?? EMPTY_MESSAGES, props.onMessagesChange, 'InlineAssist messages');
  const hydrated = useHydrated();
  const open = openState && hydrated;
  const [store] = useState(createAssistStore);
  const view = useSyncExternalStore(store.subscribe, store.getView, store.getView);
  const text = localeText ? { ...INLINE_ASSIST_DEFAULT_LOCALE_TEXT, ...localeText } : INLINE_ASSIST_DEFAULT_LOCALE_TEXT;
  const base = useId();
  const counter = useRef(0);
  const run = useRef<{ readonly controller: AbortController } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<HTMLSpanElement | null>(null);
  const latest = useLatest({ props, value, messages, open, setOpen, setValue, setMessages, text });

  // Closing (any way, controlled included) aborts the running response and clears the shown one.
  useEffect(() => {
    if (open) return;
    run.current?.controller.abort();
    store.setView({ phase: 'idle', message: null, commands: false });
  }, [open, store]);
  useEffect(
    () => () => {
      run.current?.controller.abort();
      store.dispose();
    },
    [store],
  );

  const api = useMemo(() => {
    const close = (reason: InlineAssistOpenChangeReason): void => latest.current.setOpen(false, reason);
    const start = async (prompt: string, command: InlineAssistCommand | undefined, retry: boolean): Promise<void> => {
      const l = latest.current;
      const history = retry ? l.messages.slice(0, -1) : l.messages;
      const request = buildRequest(prompt, command, selectionText(l.props.anchor, l.props.selection), history);
      if (l.props.onBeforeSend) {
        const event = cancelable({ request });
        l.props.onBeforeSend(event);
        if (event.defaultPrevented) return;
      }
      l.props.onSend?.(Object.freeze({ request }));
      if (!retry) l.setValue('');
      if (!l.open) l.setOpen(true, 'api');
      run.current?.controller.abort();
      const token = { controller: new AbortController() };
      run.current = token;
      const id = `${base}${(counter.current += 1)}`;
      store.setView({ phase: 'pending', message: null, commands: false });
      store.stream.start();
      const adapter = l.props.adapter;
      const outcome = await runStream(() => (adapter ? adapter(request, { signal: token.controller.signal }) : Promise.resolve('')), token.controller.signal, {
        text(delta) {
          if (run.current !== token) return;
          store.stream.push(delta);
          if (store.getView().phase === 'pending') store.setView({ phase: 'streaming' });
        },
      });
      // A newer request owns the view; this one is dropped.
      if (run.current !== token) return;
      run.current = null;
      store.stream.end();
      const message: InlineAssistMessage = Object.freeze({ id, prompt, ...(command ? { command: command.id } : {}), response: outcome.text, status: outcome.status });
      const after = latest.current;
      if (outcome.status === 'error') after.props.onError?.(outcome.error);
      after.setMessages((previous) => commitMessage(previous, message, retry), Object.freeze({ reason: retry ? 'retry' : 'response' }));
      if (!after.open) return;
      store.setView({ phase: 'done', message });
      announce(liveRef.current, outcome.status === 'error' ? after.text.error : outcome.text);
    };
    const send = (input?: string, command?: InlineAssistCommand, retry = false): void => {
      const prompt = (input ?? latest.current.value).trim();
      if (prompt !== '') void start(prompt, command, retry);
    };
    const selectCommand = (command: InlineAssistCommand): void => {
      const l = latest.current;
      store.setView({ commands: false });
      if (commandQuery(l.value) !== null) l.setValue('');
      inputRef.current?.focus({ preventScroll: true });
      if (l.props.onCommandSelect) {
        const event = cancelable({ command });
        l.props.onCommandSelect(event);
        if (event.defaultPrevented) return;
      }
      send(command.prompt ?? command.label, command);
    };
    const respond = (action: InlineAssistResponseAction): void => {
      const l = latest.current;
      const message = store.getView().message;
      if (!message) return;
      const id = typeof action === 'string' ? action : action.id;
      const event = cancelable({ action: id, text: message.response, message });
      l.props.onResponseActionClick?.(event);
      if (event.defaultPrevented || typeof action !== 'string') return;
      if (action === 'accept') {
        l.props.onAccept?.(Object.freeze({ text: message.response, message }));
        close('accept');
      } else if (action === 'discard') {
        l.props.onDiscard?.(Object.freeze({ message }));
        close('discard');
      } else {
        const command = message.command === undefined ? undefined : (l.props.commands ?? EMPTY_COMMANDS).find((c) => c.id === message.command);
        send(message.prompt, command, true);
      }
    };
    const handle: InlineAssistApi = {
      open: () => latest.current.setOpen(true, 'api'),
      close: () => close('api'),
      send: (input?: string) => send(input),
      stop: () => run.current?.controller.abort(),
      showCommands: () => {
        if (!latest.current.open) latest.current.setOpen(true, 'api');
        store.setView({ commands: true });
      },
      hideCommands: () => store.setView({ commands: false }),
      focus: () => inputRef.current?.focus({ preventScroll: true }),
      get element() {
        return panelRef.current;
      },
    };
    return { handle, close, send, selectCommand, respond };
  }, [base, latest, store]);
  useImperativeHandle(ref, () => api.handle, [api]);

  const ctx = useMemo<AssistContextValue>(() => ({ text, getValue: () => latest.current.value, setValue: (next) => latest.current.setValue(next) }), [text, latest]);
  const anchor = props.anchor;
  // Stable per anchor and per opening (a point rect or the fallback getter must not change on each render).
  const overlayAnchor = useMemo(() => (open ? toOverlayAnchor(anchor) : null), [anchor, open]);
  if (!open) return null;

  const commands = props.commands ?? EMPTY_COMMANDS;
  const query = commandQuery(value);
  const shown = commands.length > 0 && (view.commands || query !== null) ? filterCommands(commands, query ?? '') : EMPTY_COMMANDS;
  const menuId = `${base}commands`;
  const responding = view.phase === 'pending' || view.phase === 'streaming';

  const focusMenu = (): boolean => {
    const item = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    item?.focus();
    return !!item;
  };
  const hideCommands = (): void => {
    store.setView({ commands: false });
    if (query !== null) setValue('');
  };
  const onInputKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (shown.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (focusMenu()) event.preventDefault();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const first = shown.find((c) => !c.disabled);
        if (first) api.selectCommand(first);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!responding) api.send();
    }
  };
  // Escape in the prompt or the menu hides the command menu first (the dismiss layer then skips it).
  // Inline mode has no dismiss layer: Escape inside the panel closes it.
  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (shown.length > 0) {
      event.preventDefault();
      hideCommands();
      inputRef.current?.focus({ preventScroll: true });
    } else if (mode === 'inline') {
      event.preventDefault();
      api.close('escape');
    }
  };

  const inputProps: InlineAssistInputProps = {
    ref: inputRef,
    id: `${base}prompt`,
    className: 'salmon-inline-assist__input',
    value,
    rows: 1,
    placeholder: props.placeholder ?? text.placeholder,
    'aria-label': text.prompt,
    'aria-controls': shown.length > 0 ? menuId : undefined,
    onChange: (event) => setValue(event.currentTarget.value),
    onKeyDown: onInputKeyDown,
  };
  const defaultComposer = <textarea {...inputProps} />;
  const composer = props.renderComposer
    ? props.renderComposer({ value, setValue: (next) => setValue(next), send: (input) => api.send(input), stop: api.handle.stop, responding, inputProps, defaultComposer })
    : defaultComposer;
  const placement = props.toolbarPlacement ?? 'inline';
  const toolbar = props.toolbar != null ? (
    <div className="salmon-inline-assist__toolbar" data-placement={placement}>
      {props.toolbar}
    </div>
  ) : null;

  const content = (
    <AssistContext value={ctx}>
      <div className="salmon-inline-assist__composer">
        {composer}
        {placement === 'inline' ? toolbar : null}
        {props.children}
        {responding ? (
          <Button variant="outline" className="salmon-inline-assist__stop" onClick={api.handle.stop}>
            {text.stop}
          </Button>
        ) : (
          <Button tone="primary" className="salmon-inline-assist__send" disabled={value.trim() === ''} onClick={() => api.send()}>
            {text.send}
          </Button>
        )}
      </div>
      {shown.length > 0 ? (
        <Menu
          ref={menuRef}
          id={menuId}
          className="salmon-inline-assist__commands"
          aria-label={text.commands}
          items={shown.map(toMenuItem)}
          onAction={(event) => {
            const command = shown.find((c) => c.id === event.id);
            if (command) api.selectCommand(command);
          }}
        />
      ) : null}
      {placement === 'bottom' ? toolbar : null}
      {view.phase !== 'idle' ? <Response store={store} view={view.phase} message={view.message} text={text} actions={props.responseActions ?? DEFAULT_ACTIONS} renderContent={props.renderContent} onAction={api.respond} /> : null}
      <span ref={liveRef} className="salmon-visually-hidden" {...liveRegionProps('polite')} />
    </AssistContext>
  );

  const shared = {
    ref: panelRef,
    role: 'dialog',
    'aria-label': props['aria-labelledby'] ? undefined : (props['aria-label'] ?? text.label),
    'aria-labelledby': props['aria-labelledby'],
    className: cx('salmon-inline-assist', props.className),
    style: props.style,
    'data-mode': mode,
    'data-phase': view.phase,
    onKeyDown: onPanelKeyDown,
  } as const;
  const returnFocus = props.returnFocus !== false;
  const restore: FocusScopeOptions['restoreFocus'] = !returnFocus ? false : anchor && !isPoint(anchor) ? { get current() { return editorOf(anchor); } } : true;
  const focus: FocusScopeOptions = { autoFocus: 'first', tab: 'leave', restoreFocus: restore };

  if (mode === 'inline') {
    return (
      <InlinePanel {...shared} focus={focus}>
        {content}
      </InlinePanel>
    );
  }
  return (
    <Overlay
      {...shared}
      anchor={overlayAnchor as OverlayAnchor}
      placement="bottom-start"
      offset={6}
      onDismiss={(reason: DismissReason) => api.close(reason)}
      dismissOnOutsidePress
      dismissOnEscape
      dismissOnFocusOutside
      focus={focus}
    >
      {content}
    </Overlay>
  );
}

/** The overlay anchor of a public anchor; without one, the element focused when the assist opened. */
function toOverlayAnchor(anchor: InlineAssistAnchor | null | undefined): OverlayAnchor {
  if (isPoint(anchor)) return pointRect(anchor.x, anchor.y);
  if (anchor) return anchor as OverlayAnchor;
  let fallback: Element | null = null;
  return () => (fallback ??= (globalThis as { document?: Document }).document?.activeElement ?? null);
}

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  readonly ref: RefObject<HTMLDivElement | null>;
  readonly focus: FocusScopeOptions;
};

/** A command as a `Menu` items entry. */
function toMenuItem(command: InlineAssistCommand): MenuItemData {
  return { id: command.id, label: command.label, ...(command.icon != null ? { icon: command.icon } : {}), ...(command.disabled ? { disabled: true } : {}) };
}

/** Inline mode: the dialog in the page flow (no dismiss layer; Escape is handled by the panel). */
function InlinePanel(props: PanelProps): ReactElement {
  const { ref, focus, children, ...rest } = props;
  useFocusScope(ref, focus);
  return (
    <div {...rest} ref={ref}>
      {children}
    </div>
  );
}

interface ResponseProps {
  readonly store: AssistStore;
  readonly view: 'pending' | 'streaming' | 'done';
  readonly message: InlineAssistMessage | null;
  readonly text: Required<InlineAssistLocaleText>;
  readonly actions: readonly InlineAssistResponseAction[];
  readonly renderContent: InlineAssistProps['renderContent'];
  readonly onAction: (action: InlineAssistResponseAction) => void;
}

function Response(props: ResponseProps): ReactElement {
  const { store, view, message, text, actions, renderContent, onAction } = props;
  const done = view === 'done' && message !== null;
  const failed = done && message.status === 'error';
  let body: ReactNode;
  if (done) body = renderContent ? renderContent(message.response, { streaming: false }) : <div className="salmon-inline-assist__text" dir="auto">{message.response}</div>;
  else if (renderContent) body = <RenderedStream stream={store.stream} render={renderContent} />;
  else body = <StreamText stream={store.stream} />;
  return (
    <div className="salmon-inline-assist__response" data-status={done ? message.status : view} aria-busy={done ? undefined : true}>
      {view === 'pending' ? <div className="salmon-inline-assist__pending">{text.pending}</div> : null}
      {body}
      {failed ? <div className="salmon-inline-assist__error">{text.error}</div> : null}
      {done ? (
        <div className="salmon-inline-assist__actions" role="group" aria-label={text.responseActions}>
          {actions.map((action) => {
            const builtIn = typeof action === 'string';
            const id = builtIn ? action : action.id;
            return (
              <Button
                key={id}
                size="sm"
                variant={id === 'accept' ? 'solid' : 'ghost'}
                tone={id === 'accept' ? 'primary' : 'neutral'}
                data-action={id}
                disabled={id === 'accept' && message.response === ''}
                iconStart={builtIn ? undefined : action.icon}
                onClick={() => onAction(action)}
              >
                {builtIn ? text[action] : action.label}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Default streaming renderer: appends each published delta to one text node, outside React. */
function StreamText(props: { readonly stream: StreamBuffer }): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const { stream } = props;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const node = el.ownerDocument.createTextNode('');
    el.append(node);
    const paint = (): void => {
      const next = stream.getSnapshot().text;
      if (next.length > node.data.length && next.startsWith(node.data)) node.appendData(next.slice(node.data.length));
      else if (next !== node.data) node.data = next;
    };
    paint();
    const unsubscribe = stream.subscribe(paint);
    return () => {
      unsubscribe();
      node.remove();
    };
  }, [stream]);
  return <div ref={ref} className="salmon-inline-assist__text" dir="auto" />;
}

/** `renderContent` while streaming: one render per published frame. */
function RenderedStream(props: { readonly stream: StreamBuffer; readonly render: NonNullable<InlineAssistProps['renderContent']> }): ReactNode {
  const snapshot = useSyncExternalStore(props.stream.subscribe, props.stream.getSnapshot, props.stream.getSnapshot);
  return props.render(snapshot.text, { streaming: true });
}

/** `SpeechToTextButton` props; the transcript is written into the prompt. */
export type InlineAssistDictationProps = SpeechToTextButtonProps;

/**
 * Dictation into the prompt: the Inputs `SpeechToTextButton`; the
 * transcript is appended to the prompt text present when listening started.
 * Render it as a child of `InlineAssist`.
 */
export function InlineAssistDictation(props: InlineAssistDictationProps): ReactElement {
  const ctx = use(AssistContext);
  if (!ctx) throw new Error('[salmonui] <InlineAssist.Dictation> must be rendered inside <InlineAssist>.');
  const startValue = useRef('');
  const { onStart, onTranscriptChange, localeText, className, ...rest } = props;
  return (
    <SpeechToTextButton
      variant="ghost"
      {...rest}
      className={cx('salmon-inline-assist__dictation', className)}
      localeText={{ label: ctx.text.dictation, ...localeText }}
      onStart={() => {
        startValue.current = ctx.getValue();
        onStart?.();
      }}
      onTranscriptChange={(transcript, details) => {
        ctx.setValue(mergeTranscript(startValue.current, transcript));
        onTranscriptChange?.(transcript, details);
      }}
    />
  );
}

InlineAssist.Dictation = InlineAssistDictation;
