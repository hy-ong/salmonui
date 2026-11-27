import { expect, test } from '@playwright/test';
import { listenerCount, trackListeners } from './helpers.ts';
import { act, caretAfter, content, dialog, getHtml, item, log, openRte as open, pasteImage, quickItem, selectText } from './rich-text-helpers.ts';

// RichTextEditor insertion features: images and uploads, audio,
// video and embeds, import, emoji, slash menu,
// mentions, file browser and the AI assistant.
// Page: examples/vite-spa/src/rich-text.tsx.

test.describe('RichTextEditor insertion', () => {
  test('a pasted image stays pending until onUpload settles, then inserts its src and alt', async ({ page }) => {
    await open(page, 'upload');
    await caretAfter(page, 'some text.');
    await pasteImage(page, 'shot.png');
    await expect(content(page).locator('.salmon-rich-text__uploading')).toHaveText('Uploading');
    await expect(content(page).locator('img[alt="uploaded shot.png"]')).toHaveCount(1);
    await expect(content(page).locator('.salmon-rich-text__uploading')).toHaveCount(0);
    expect((await log(page)).uploads).toEqual(['shot.png']);
    expect(await getHtml(page)).toMatch(/<img src="data:image\/png;base64,[^"]+" alt="uploaded shot.png">/);
    // Dropped files go through the same path.
    await pasteImage(page, 'dropped.png', 'drop');
    await expect(content(page).locator('img[alt="uploaded dropped.png"]')).toHaveCount(1);
  });

  test('a failed upload removes the placeholder and reports the error', async ({ page }) => {
    await open(page, 'upload=fail');
    await caretAfter(page, 'some text.');
    await pasteImage(page);
    await expect.poll(async () => (await log(page)).uploadErrors).toBe(1);
    await expect(content(page).locator('.salmon-rich-text__uploading')).toHaveCount(0);
    expect(await content(page).locator('img:not(.ProseMirror-separator)').count()).toBe(1);
  });

  test('without onUpload, imageInsert="base64" inlines a data URL and the default is a blob URL', async ({ page }) => {
    await open(page, 'base64');
    await caretAfter(page, 'some text.');
    await pasteImage(page, 'a.png');
    await expect.poll(() => getHtml(page)).toMatch(/<img src="data:image\/png;base64,[^"]+" alt="a">/);
    await open(page);
    await caretAfter(page, 'some text.');
    await pasteImage(page, 'b.png');
    await expect(content(page).locator('img[alt="b"]')).toHaveAttribute('src', /^blob:/);
  });

  test('image dialog: URL, alt, size and caption; quick toolbar edit; resize handle', async ({ page }) => {
    await open(page);
    await caretAfter(page, 'some text.');
    await item(page, 'image').click();
    const d = dialog(page);
    await expect(d).toHaveAccessibleName('Insert image');
    await d.getByLabel('Image URL').fill('https://example.com/cat.png');
    await d.getByLabel('Alternative text').fill('A cat');
    await d.getByLabel('Width').fill('120');
    await d.getByRole('button', { name: 'Insert' }).click();
    expect(await getHtml(page)).toContain('<img src="https://example.com/cat.png" alt="A cat" width="120">');
    const img = content(page).locator('img[alt="A cat"]');
    await img.click();
    await expect(page.locator('.salmon-rich-text__quick[data-quick="image"]')).toBeVisible();
    await quickItem(page, 'editImage').click();
    await expect(dialog(page)).toHaveAccessibleName('Edit image');
    await expect(dialog(page).getByLabel('Alternative text')).toHaveValue('A cat');
    await dialog(page).getByLabel('Alternative text').fill('A grey cat');
    await dialog(page).getByRole('button', { name: 'Update' }).click();
    expect(await getHtml(page)).toContain('alt="A grey cat" width="120"');
    // Resize: drag the handle of the selected image.
    await content(page).locator('img[alt="A grey cat"]').click();
    const handle = content(page).locator('.ProseMirror-selectednode .salmon-rich-text__resize-handle');
    await expect(handle).toBeVisible();
    const before = (await content(page).locator('img[alt="A grey cat"]').boundingBox())!.width;
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + 4);
    await page.mouse.down();
    await page.mouse.move(box.x + 64, box.y + 4, { steps: 4 });
    await page.mouse.up();
    // The drag adds 60 px to the rendered width and keeps the aspect ratio (width and height written once, on release).
    const after = await getHtml(page);
    const resized = /alt="A grey cat" width="(\d+)" height="\d+"/.exec(after);
    expect(resized, after).not.toBeNull();
    expect(Math.abs(Number(resized![1]) - (before + 60))).toBeLessThanOrEqual(2);
    // Caption creates a figure.
    await caretAfter(page, 'Release notes');
    await item(page, 'image').click();
    await dialog(page).getByLabel('Image URL').fill('https://example.com/dog.png');
    await dialog(page).getByLabel('Caption').fill('Good dog');
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    expect(await getHtml(page)).toContain('<figure><img src="https://example.com/dog.png" alt=""><figcaption>Good dog</figcaption></figure>');
    // Remove from the quick toolbar.
    await content(page).locator('img[alt="A grey cat"]').click();
    await quickItem(page, 'removeNode').click();
    await expect(content(page).locator('img[alt="A grey cat"]')).toHaveCount(0);
  });

  test('audio, video and text quick toolbars; per-context item lists and false hides one', async ({ page }) => {
    const quick = (kind: string) => page.locator(`.salmon-rich-text__quick[data-quick="${kind}"]`);
    // Media controls take the click, so a media node is selected from the keyboard (ArrowLeft from the next paragraph).
    const selectMediaBefore = async (text: string) => {
      await selectText(page, text);
      const sel = await act<{ from: number }>(page, 'getSelection');
      await act(page, 'setSelection', sel.from);
      await page.keyboard.press('ArrowLeft');
    };
    // Defaults: audio and video get "remove"; the text quick toolbar is off with a fixed toolbar.
    await open(page);
    await caretAfter(page, 'some text.');
    await act(page, 'run', 'insertHtml', '<audio controls src="https://example.com/a.mp3"></audio><p>after audio</p>');
    await selectMediaBefore('after audio');
    await expect(quick('audio')).toBeVisible();
    await expect(quick('audio').locator('[data-item-id]')).toHaveCount(1);
    await quickItem(page, 'removeNode').click();
    await expect(content(page).locator('audio')).toHaveCount(0);
    await caretAfter(page, 'after audio');
    await act(page, 'run', 'insertHtml', '<video controls src="https://example.com/v.mp4" width="320"></video><p>after video</p>');
    await selectMediaBefore('after video');
    await expect(quick('video')).toBeVisible();
    await expect(quick('video').getByRole('toolbar')).toHaveAccessibleName(/./);
    await selectText(page, 'some text');
    await expect(quick('text')).toHaveCount(0);

    // Custom lists: a text quick toolbar on a fixed toolbar, custom video items, link: false.
    await open(page, 'quick=custom');
    await selectText(page, 'some text');
    await expect(quick('text')).toBeVisible();
    await expect(quick('text').locator('[data-item-id]')).toHaveCount(2);
    await quickItem(page, 'bold').click();
    await expect.poll(() => getHtml(page)).toContain('<strong>some text</strong>');
    await caretAfter(page, 'some text');
    await act(page, 'run', 'insertHtml', '<video controls src="https://example.com/v.mp4" width="320"></video><p>tail</p>');
    await selectMediaBefore('tail');
    await expect(quick('video')).toBeVisible();
    await expect(quick('video').locator('[data-item-id="alignments"]')).toHaveCount(1);
    await expect(quick('video').locator('[data-item-id="removeNode"]')).toHaveCount(1);
    await act(page, 'run', 'insertHtml', '<p><a href="https://example.com">a link</a></p>');
    await selectText(page, 'a link');
    const sel = await act<{ from: number }>(page, 'getSelection');
    await act(page, 'setSelection', sel.from + 2);
    await expect(quick('link')).toHaveCount(0);
  });

  test('audio and video from a URL or upload; embeds only from embedHosts', async ({ page }) => {
    await open(page, 'embed&upload');
    await caretAfter(page, 'some text.');
    await item(page, 'audio').click();
    await dialog(page).getByLabel('URL').fill('https://example.com/a.mp3');
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    await item(page, 'video').click();
    await dialog(page).getByLabel('URL').fill('https://example.com/v.mp4');
    await dialog(page).getByLabel('Width').fill('320');
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    await item(page, 'embed').click();
    await dialog(page).getByLabel('URL').fill('https://www.youtube-nocookie.com/embed/abc');
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    const value = await getHtml(page);
    expect(value).toContain('<audio controls src="https://example.com/a.mp3"></audio>');
    expect(value).toContain('<video controls src="https://example.com/v.mp4" width="320"></video>');
    expect(value).toContain('<iframe src="https://www.youtube-nocookie.com/embed/abc" allowfullscreen></iframe>');
    // A host outside the allow-list is dropped by the sanitizer.
    await act(page, 'run', 'insertHtml', '<iframe src="https://evil.example/x"></iframe>');
    expect(await getHtml(page)).not.toContain('evil.example');
    // Upload through the media dialog.
    await item(page, 'audio').click();
    await dialog(page).getByLabel('Upload file').setInputFiles({ name: 'song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3') });
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    await expect.poll(async () => (await log(page)).uploads).toEqual(['song.mp3']);
    await expect.poll(() => getHtml(page)).toMatch(/<audio controls src="blob:http[^"]+"><\/audio>/);
  });

  test('import through onImport inserts sanitized HTML; getHtml exports it', async ({ page }) => {
    // Subscribe before the page loads: Playwright turns on file chooser interception asynchronously
    // when the first listener is added, and a chooser opened before that never emits the event.
    const chooser = page.waitForEvent('filechooser');
    await open(page, 'import');
    await caretAfter(page, 'some text.');
    await item(page, 'import').click();
    await (await chooser).setFiles({ name: 'notes.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('From Word') });
    await expect(content(page)).toContainText('Imported From Word');
    expect((await log(page)).imports).toEqual(['notes.docx']);
    const value = await getHtml(page);
    expect(value).toContain('<p>Second paragraph with some text.</p><p>Imported <em>From Word</em></p>');
    expect(value).not.toContain('script');
  });

  test('emoji picker from the toolbar: search, arrows, Enter; the ":" trigger completes inline', async ({ page }) => {
    await open(page, 'emoji');
    await caretAfter(page, 'some text.');
    await item(page, 'emoji').click();
    const search = page.getByRole('combobox', { name: 'Search emoji' });
    await expect(search).toBeFocused();
    await expect(page.locator('.salmon-rich-text__emoji [role="option"]')).toHaveCount(3);
    await search.fill('ro');
    await expect(page.locator('.salmon-rich-text__emoji [role="option"]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    expect(await getHtml(page)).toContain('some text.🚀</p>');
    await page.keyboard.type(' :ta');
    const popup = page.locator('.salmon-rich-text__popup[data-popup="emojiTrigger"]');
    await expect(popup.getByRole('option')).toHaveText(['🎉 :tada:']);
    await expect(content(page)).toHaveAttribute('aria-activedescendant', /.+/);
    await page.keyboard.press('Enter');
    expect(await getHtml(page)).toContain('some text.🚀 🎉</p>');
    await expect(popup).toHaveCount(0);
    // Escape dismisses the trigger popup and keeps the text.
    await page.keyboard.type(' :ro');
    await expect(page.locator('.salmon-rich-text__popup')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.salmon-rich-text__popup')).toHaveCount(0);
    expect(await getHtml(page)).toContain('🎉 :ro</p>');
  });

  test('the built-in emoji list is a lazy chunk', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await open(page);
    expect(requests.some((u) => u.includes('emoji-data'))).toBe(false);
    await caretAfter(page, 'some text.');
    await item(page, 'emoji').click();
    await expect(page.locator('.salmon-rich-text__emoji [role="option"]').first()).toBeVisible();
    expect(requests.some((u) => u.includes('emoji-data'))).toBe(true);
  });

  test('slash menu on "/": filter, arrows, Enter runs the item', async ({ page }) => {
    await open(page, 'slash');
    await caretAfter(page, 'some text.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    const popup = page.locator('.salmon-rich-text__popup[data-popup="slash"]');
    await expect(popup.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
    await page.keyboard.type('head');
    await expect(popup.getByRole('option')).toHaveText(['Heading 1', 'Heading 2', 'Heading 3']);
    await page.keyboard.press('ArrowDown');
    await expect(popup.getByRole('option', { name: 'Heading 2' })).toHaveAttribute('aria-selected', 'true');
    const blocksBefore = await content(page).locator(':scope > *').count();
    await page.keyboard.press('Enter');
    await expect(popup).toHaveCount(0);
    // Enter ran the item: the block became a heading in place, no paragraph was split off.
    expect(await content(page).locator(':scope > *').count()).toBe(blocksBefore);
    await page.keyboard.type('Section');
    expect(await getHtml(page)).toContain('<p>Second paragraph with some text.</p><h2>Section</h2><p><img');
    // A slash inside a word is plain text.
    await page.keyboard.type(' and/or');
    await expect(page.locator('.salmon-rich-text__popup')).toHaveCount(0);
  });

  test('mentions: "@" opens the Mention list on the editor and inserts a mention node', async ({ page }) => {
    await trackListeners(page);
    await open(page, 'mentions');
    // Mention is a lazy chunk mounted after the engine; it sees typing only once its effect subscribed to
    // the editor and attached its capture keydown listener to the content element.
    await expect.poll(() => listenerCount(page, '.salmon-rich-text__content', 'keydown:capture')).toBeGreaterThan(0);
    await caretAfter(page, 'some text.');
    await page.keyboard.type(' @al');
    const popup = page.locator('.salmon-mention-popup');
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('option')).toHaveText(['Alice Smith']);
    await page.keyboard.press('Enter');
    await expect(popup).toHaveCount(0);
    await page.keyboard.type('hi');
    expect(await getHtml(page)).toContain('some text. <span data-type="mention" data-id="alice" data-trigger="@">@Alice Smith</span> hi</p>');
    // The atom deletes as one unit.
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    expect(await getHtml(page)).toContain('some text. </p>');
  });

  test('onBrowseFiles fills the image dialog from the application file browser', async ({ page }) => {
    await open(page, 'browse');
    await caretAfter(page, 'some text.');
    await item(page, 'image').click();
    await dialog(page).getByRole('button', { name: 'Browse files' }).click();
    await expect(dialog(page).getByLabel('Image URL')).toHaveValue('https://example.com/picked.png');
    await expect(dialog(page).getByLabel('Alternative text')).toHaveValue('Picked image');
    await dialog(page).getByRole('button', { name: 'Insert' }).click();
    expect(await getHtml(page)).toContain('<img src="https://example.com/picked.png" alt="Picked image">');
    expect((await log(page)).browse).toEqual(['image']);
  });

  test('AI assistant streams into a pending insert the user accepts or discards; output is text', async ({ page }) => {
    await open(page, 'ai');
    await selectText(page, 'Second paragraph');
    await item(page, 'aiAssistant').click();
    const d = dialog(page);
    await d.getByLabel('Prompt').fill('summary');
    await d.getByRole('button', { name: 'Generate' }).click();
    const output = d.locator('.salmon-rich-text__ai-output');
    await expect(output).toHaveText('Generated <b>text</b> for summary');
    expect(await getHtml(page)).not.toContain('Generated');
    const request = (await log(page)).ai[0]!;
    expect(request.prompt).toBe('summary');
    expect(request.selectionHtml).toBe('<p>Second paragraph</p>');
    await d.getByRole('button', { name: 'Insert' }).click();
    await expect(d).toHaveCount(0);
    const value = await getHtml(page);
    // The accepted text replaces the selection.
    expect(value).toContain('<p>Generated &lt;b&gt;text&lt;/b&gt; for summary with some text.</p>');
    expect(value).not.toContain('<b>');
    // Discard leaves the document unchanged.
    await item(page, 'aiAssistant').click();
    await dialog(page).getByLabel('Prompt').fill('again');
    await dialog(page).getByRole('button', { name: 'Generate' }).click();
    await expect(dialog(page).locator('.salmon-rich-text__ai-output')).toHaveText('Generated <b>text</b> for again');
    await dialog(page).getByRole('button', { name: 'Discard' }).click();
    expect(await getHtml(page)).toBe(value);
  });
});
