import type { Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Shared helpers of the RichTextEditor specs (page: examples/vite-spa/src/rich-text.tsx).

export interface RteLog {
  changes: string[];
  blurs: string[];
  commands: { command: string; applied: boolean }[];
  before: string[];
  toolbar: string[];
  dialogs: string[];
  closed: string[];
  popups: string[];
  states: number;
  ready: boolean;
  uploads: string[];
  fullscreen: boolean[];
  ai: { prompt: string; selectionHtml: string }[];
  browse: string[];
  imports: string[];
  extension: string[];
  uploadErrors: number;
}

export const rteUrl = (query = ''): string => `${DEV_URL}rich-text.html${query ? `?${query}` : ''}`;
export const content = (page: Page) => page.locator('.salmon-rich-text__content');
export const item = (page: Page, id: string) => page.locator(`.salmon-rich-text > .salmon-rich-text__toolbar [data-item-id="${id}"]`);
export const quickItem = (page: Page, id: string) => page.locator(`.salmon-rich-text__quick [data-item-id="${id}"]`);
export const dialog = (page: Page) => page.getByRole('dialog');
export const log = (page: Page): Promise<RteLog> => page.evaluate(() => (window as unknown as { __rte: RteLog }).__rte);

/** Runs `actionsRef.current.<method>(...args)` in the page. */
export function act<T = unknown>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([m, a]) => {
      const actions = (window as unknown as { __rteActions: Record<string, (...x: unknown[]) => unknown> }).__rteActions;
      return actions[m as string]!(...(a as unknown[])) as never;
    },
    [method, args] as const,
  );
}

/** Runs `actionsRef.current.commands.<name>(...args)`. */
export function command<T = unknown>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([n, a]) => {
      const actions = (window as unknown as { __rteActions: { commands: Record<string, (...x: unknown[]) => unknown> } }).__rteActions;
      return actions.commands[n as string]!(...(a as unknown[])) as never;
    },
    [name, args] as const,
  );
}

export const getHtml = (page: Page, xhtml = false): Promise<string> => act<string>(page, 'getHtml', { xhtml });

export async function openRte(page: Page, query = ''): Promise<void> {
  await page.goto(rteUrl(query));
  await page.waitForFunction(() => (window as unknown as { __rte?: RteLog }).__rte?.ready === true);
}

/** Selects the first occurrence of `text` through the engine and focuses the editor. */
export async function selectText(page: Page, text: string): Promise<void> {
  await page.evaluate((needle) => {
    type N = { isText: boolean; text?: string };
    const actions = (window as unknown as { __rteActions: { engine: { state: { doc: { descendants(f: (n: N, pos: number) => void): void } } }; setSelection(a: number, h: number): void; focus(): void } }).__rteActions;
    let found = -1;
    actions.engine.state.doc.descendants((node, pos) => {
      if (found < 0 && node.isText && node.text!.includes(needle)) found = pos + node.text!.indexOf(needle);
    });
    if (found < 0) throw new Error(`text not found: ${needle}`);
    actions.focus();
    actions.setSelection(found, found + needle.length);
  }, text);
}

/** Puts the caret after `text` (collapsed). */
export async function caretAfter(page: Page, text: string): Promise<void> {
  await selectText(page, text);
  const sel = await act<{ to: number }>(page, 'getSelection');
  await act(page, 'setSelection', sel.to);
}

/** Pastes clipboard data into the editor through a synthetic paste event. */
export async function paste(page: Page, data: Record<string, string>): Promise<void> {
  await page.evaluate((entries) => {
    const transfer = new DataTransfer();
    for (const [type, value] of Object.entries(entries)) transfer.setData(type, value);
    const target = document.querySelector('.salmon-rich-text__content')!;
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, data);
}

/** Pastes or drops a generated PNG file. */
export async function pasteImage(page: Page, name = 'shot.png', kind: 'paste' | 'drop' = 'paste'): Promise<void> {
  await page.evaluate(
    async ([fileName, how]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], fileName!, { type: 'image/png' }));
      const target = document.querySelector('.salmon-rich-text__content p')!;
      if (how === 'paste') target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
      else {
        const rect = target.getBoundingClientRect();
        target.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: rect.left + 2, clientY: rect.top + 2 }));
      }
    },
    [name, kind] as const,
  );
}
