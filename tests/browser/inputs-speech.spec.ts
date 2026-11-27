import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Speech To Text in the browser.
// Page: examples/vite-spa/inputs.html?only=speech (examples/vite-spa/src/inputs-speech.tsx).
// The recognizer is a fake driven through window.__speech: no microphone.

async function open(page: Page, query = '?only=speech'): Promise<void> {
  await page.goto(`${DEV_URL}inputs.html${query}`);
  await page.waitForFunction(() => window.__inputsReady === true);
  await page.waitForSelector('#page');
}
const events = (page: Page, kind: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;
const emit = (page: Page, results: [string, boolean][]) => page.evaluate((r) => window.__speech!.emit(r), results);

test.describe('Speech To Text', () => {
  test('the toggle button starts and stops listening with aria-pressed and a constant name', async ({ page }) => {
    await open(page);
    const button = page.locator('#stt-button');
    await expect(button).toHaveAccessibleName('Speech to text');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveAttribute('data-state', 'idle');
    await expect(button).toHaveAccessibleDescription('Start listening');
    await expect(button).toHaveAttribute('data-tone', 'primary');
    // Icon-only md button: 32px square with a 16px glyph.
    expect(await button.evaluate((el) => [el.getBoundingClientRect().width, el.getBoundingClientRect().height, el.querySelector('svg')!.getBoundingClientRect().width])).toEqual([32, 32, 16]);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toHaveAttribute('data-state', 'listening');
    await expect(button).toHaveAccessibleDescription('Stop listening');
    await expect(button).toHaveAttribute('title', 'Stop listening');
    await expect(button).toHaveAccessibleName('Speech to text');
    await button.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveAttribute('data-state', 'stopped');
    expect((await events(page, 'speech')).map((e) => e['event'])).toEqual(['start', 'stop']);
    // Space toggles too; the labelled variant shows its text.
    await button.press('Space');
    await expect(button).toHaveAttribute('data-state', 'listening');
    await expect(page.locator('#stt-labelled')).toHaveAccessibleName('Dictate');
    await expect(page.locator('#stt-labelled')).toHaveAttribute('data-variant', 'outline');
  });

  test('interim then final transcripts reach onTranscriptChange and the hook transcript', async ({ page }) => {
    await open(page);
    await page.locator('#stt-button').click();
    await expect(page.locator('#stt-button')).toHaveAttribute('data-state', 'listening');
    await emit(page, [['hello', true], [' wor', false]]);
    await emit(page, [['hello', true], [' world', true]]);
    await expect(page.locator('#stt-text')).toHaveValue('hello world');
    expect((await events(page, 'speech')).filter((e) => e['event'] === 'transcript')).toEqual([
      { kind: 'speech', event: 'transcript', transcript: 'hello wor', final: false },
      { kind: 'speech', event: 'transcript', transcript: 'hello world', final: true },
    ]);
    expect((await events(page, 'speech-recognizer')).at(-1)).toMatchObject({ continuous: true, interimResults: true });
    // The hook alone: state and transcript.
    await page.locator('#stt-hook-start').click();
    await expect(page.locator('#stt-hook-state')).toHaveText('listening');
    expect((await events(page, 'speech-recognizer')).at(-1)).toMatchObject({ interimResults: false });
    await emit(page, [['bonjour', true]]);
    await expect(page.locator('#stt-hook-transcript')).toHaveText('bonjour');
    await page.locator('#stt-hook-stop').click();
    await expect(page.locator('#stt-hook-state')).toHaveText('stopped');
  });

  test('lang defaults to the document language at start and the option overrides it', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (document.documentElement.lang = 'en-GB'));
    await page.locator('#stt-button').click();
    expect((await events(page, 'speech-recognizer')).at(-1)?.['lang']).toBe('en-GB');
    await page.locator('#stt-button').click();
    await page.locator('#stt-hook-start').click();
    expect((await events(page, 'speech-recognizer')).at(-1)?.['lang']).toBe('fr-FR');
  });

  test('recognizer errors pass their code and end the session', async ({ page }) => {
    await open(page);
    await page.locator('#stt-button').click();
    await expect(page.locator('#stt-button')).toHaveAttribute('data-state', 'listening');
    await page.evaluate(() => {
      window.__speech!.error('not-allowed');
      window.__speech!.end();
    });
    await expect(page.locator('#stt-button')).toHaveAttribute('data-state', 'stopped');
    expect((await events(page, 'speech')).map((e) => [e['event'], e['code']])).toEqual([
      ['start', undefined],
      ['error', 'not-allowed'],
      ['stop', undefined],
    ]);
  });

  test('without the Web Speech API the button is disabled and described as unsupported', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w['SpeechRecognition'];
      delete w['webkitSpeechRecognition'];
    });
    await open(page);
    await expect(page.locator('#stt-supported')).toHaveText('false');
    const browser = page.locator('#stt-browser');
    await expect(browser).toBeDisabled();
    await expect(browser).toHaveAccessibleDescription('Speech recognition is not supported in this browser');
    await expect(browser).toHaveAttribute('data-unsupported', '');
    // A replaceable recognizer keeps working.
    await expect(page.locator('#stt-button')).toBeEnabled();
  });

  test('with the Web Speech API the browser button is enabled', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'] = class {};
    });
    await open(page);
    await expect(page.locator('#stt-supported')).toHaveText('true');
    await expect(page.locator('#stt-browser')).toBeEnabled();
  });
});

test('speech markup hydrates with zero warnings and stays interactive', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, '?hydrate&only=speech');
  await page.locator('#stt-button').click();
  await expect(page.locator('#stt-button')).toHaveAttribute('aria-pressed', 'true');
  expect(problems).toEqual([]);
});
