// BlockEditor: a block-based
// editor on the shared ProseMirror engine. The server renders the blocks as
// sanitized HTML in the element the engine mounts on after hydration; the
// controller and the UI (handles, menus, slash menu, inline toolbar) load
// with dynamic import() in an effect, so the root entry stays server-safe and
// free of ProseMirror.
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { blocksToHtml } from '../../blocks/to-html.js';
import { findBlock } from '../../blocks/find.js';
import type { Block } from '../../blocks/types.js';
import { BLOCK_EDITOR_DEFAULT_LOCALE_TEXT, type BlockEditorLocaleText } from './locale.js';
import type { BlockEditorActions, BlockEditorProps } from './types.js';
import type { BlockController } from './controller.js';

type UiModule = typeof import('./ui.js');

const EMPTY: readonly Block[] = [];

/** The block editor (`@salmonui/rich-text`); value is `Block[]` JSON. */
export function BlockEditor(props: BlockEditorProps): ReactElement {
  const { value, defaultValue, readOnly = false, className, style, id } = props;
  const localeText = useLocaleText('blockEditor', props.localeText);
  const [initial] = useState<readonly Block[]>(() => value ?? defaultValue ?? EMPTY);
  // The server markup; never changes afterwards (the engine owns the element after mount).
  const [html] = useState(() => blocksToHtml(initial));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<BlockController | null>(null);
  const latest = useRef(props);
  const [client, setClient] = useState<{ ui: UiModule; controller: BlockController } | null>(null);
  const locale: BlockEditorLocaleText = localeText ? { ...BLOCK_EDITOR_DEFAULT_LOCALE_TEXT, ...localeText } : BLOCK_EDITOR_DEFAULT_LOCALE_TEXT;
  // UI callbacks the lazy UI registers (slash keys, menus, paste prompt).
  const uiHooks = useRef<{ suggestKey: (e: KeyboardEvent) => boolean; action: (id: string) => boolean; pastePrompt: () => Promise<'keep' | 'clean' | 'plainText' | null> }>({
    suggestKey: () => false,
    action: () => false,
    pastePrompt: () => Promise.resolve('clean'),
  });

  useLayoutEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    let cancelled = false;
    let controller: BlockController | null = null;
    void Promise.all([import('./controller.js'), import('./ui.js')]).then(async ([mod, ui]) => {
      if (cancelled) return;
      const p = latest.current;
      const blocks = p.value ?? initial;
      controller = await mod.createBlockController(element, blocks, {
        props: () => latest.current,
        suggestKey: (event) => uiHooks.current.suggestKey(event),
        action: (actionId) => uiHooks.current.action(actionId),
        pastePrompt: () => uiHooks.current.pastePrompt(),
      });
      if (cancelled) {
        controller.destroy();
        return;
      }
      controllerRef.current = controller;
      setClient({ ui, controller });
    });
    return () => {
      cancelled = true;
      controller?.destroy();
      controllerRef.current = null;
      setClient(null);
    };
  }, [initial]);

  // Controlled value.
  useEffect(() => {
    if (client && value) client.controller.syncValue(value);
  }, [client, value]);

  // Editable and ARIA attributes follow the props.
  useEffect(() => {
    client?.controller.refresh();
  }, [client, readOnly, props['aria-label'], props['aria-labelledby']]);

  const [actions] = useState<BlockEditorActions>(() => {
    const c = () => controllerRef.current;
    const fallback = (): Block[] => [...(latest.current.value ?? initial)];
    return {
      getBlocks: () => c()?.getBlocks() ?? fallback(),
      getBlock: (blockId) => c()?.getBlock(blockId) ?? findBlock(fallback(), blockId),
      insertBlocks: (blocks, position) => c()?.insertBlocks(blocks, position),
      removeBlocks: (ids) => c()?.removeBlocks(ids),
      updateBlock: (blockId, patch) => c()?.updateBlock(blockId, patch),
      moveBlock: (blockId, position) => c()?.move(blockId, position, 'api') ?? false,
      turnInto: (blockId, type) => c()?.turnInto(blockId, type),
      getSelection: () => c()?.getSelection() ?? null,
      setSelection: (selection) => c()?.setSelection(selection),
      focus: () => c()?.focus(),
      runCommand: (commandId, ...args) => c()?.runAction(commandId, ...args) ?? false,
      getHtml: () => c()?.getHtml() ?? blocksToHtml(fallback()),
      print: () => {
        c()?.runAction('print');
      },
    };
  });
  useImperativeHandle(props.actionsRef, () => actions, [actions]);

  const label = props['aria-labelledby'] ? undefined : (props['aria-label'] ?? locale.editor);
  const rootClass = ['salmon-block-editor', readOnly ? 'salmon-block-editor--readonly' : null, className].filter(Boolean).join(' ');
  const UI = client?.ui.BlockEditorUi;
  return (
    <div ref={rootRef} id={id} className={rootClass} style={style}>
      <div
        ref={contentRef}
        className="salmon-block-editor__content salmon-rich-text-content"
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-labelledby={props['aria-labelledby']}
        aria-readonly={readOnly || undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {UI && client ? <UI controller={client.controller} rootRef={rootRef} contentRef={contentRef} locale={locale} props={props} hooks={uiHooks} actions={actions} /> : null}
    </div>
  );
}
