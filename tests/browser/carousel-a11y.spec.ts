import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { DEV_URL } from './helpers.ts';

// Carousel accessibility: APG Carousel roles and names, live region, an ARIA snapshot, and
// axe in light, dark, RTL, fade and auto-play. The file name matches the
// `test:a11y` filter (`a11y.spec`).

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}carousel.html${query ? `?${query}` : ''}`);
  await expect(page.locator('.salmon-carousel')).toHaveAttribute('data-ready', '');
}

test.describe('Carousel accessibility', () => {
  test('APG roles: carousel region, slide groups named "N of M", controls wired to the track', async ({ page }) => {
    await open(page);
    const region = page.getByRole('region', { name: 'Highlights' });
    await expect(region).toHaveAttribute('aria-roledescription', 'carousel');
    const slides = region.getByRole('group').and(page.locator('[aria-roledescription="slide"]'));
    await expect(slides).toHaveCount(5);
    await expect(slides.first()).toHaveAccessibleName('Story 1, 1 of 5');
    const trackId = (await page.locator('.salmon-carousel-track').getAttribute('id'))!;
    for (const name of ['Previous slide', 'Next slide', 'Slide 1: Story 1']) await expect(region.getByRole('button', { name })).toHaveAttribute('aria-controls', trackId);
    await expect(page.locator('.salmon-carousel-track')).toHaveAttribute('aria-live', 'polite');
    await expect(region.getByRole('group', { name: 'Choose slide to display' })).toBeVisible();
  });

  test('ARIA snapshot', async ({ page }) => {
    await open(page, 'n=3&autoPlay=100000');
    await expect(page.locator('.salmon-carousel')).toMatchAriaSnapshot(`
      - region "Highlights":
        - button "Stop automatic slide show"
        - button "Previous slide"
        - button "Next slide"
        - group "Story 1, 1 of 3":
          - paragraph:
            - text: Slide 1
            - link "Read story 1"
        - group "Story 2, 2 of 3":
          - paragraph:
            - text: Slide 2
            - link "Read story 2"
        - group "Story 3, 3 of 3":
          - paragraph:
            - text: Slide 3
            - link "Read story 3"
        - group "Choose slide to display":
          - 'button "Slide 1: Story 1"'
          - 'button "Slide 2: Story 2"'
          - 'button "Slide 3: Story 3"'
    `);
  });

  test('while auto-play runs the live region is off; pausing makes it polite', async ({ page }) => {
    await open(page, 'autoPlay=100000');
    await expect(page.locator('.salmon-carousel-track')).toHaveAttribute('aria-live', 'off');
    await page.getByRole('button', { name: 'Stop automatic slide show' }).click();
    await expect(page.locator('.salmon-carousel-track')).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByRole('button', { name: 'Start automatic slide show' })).toBeFocused();
  });

  test('focus is visible on the track, the buttons and the indicators', async ({ page }) => {
    await open(page);
    await page.locator('#before').focus();
    const outlines: string[] = [];
    const outline = () => page.evaluate(() => `${document.activeElement!.className}:${getComputedStyle(document.activeElement!).outlineStyle}`);
    // Previous, next, the track; then from the end of the page back to the last indicator.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      outlines.push(await outline());
    }
    await page.locator('#after').focus();
    await page.keyboard.press('Shift+Tab');
    outlines.push(await outline());
    expect(outlines).toEqual(['salmon-carousel-previous:solid', 'salmon-carousel-next:solid', 'salmon-carousel-track:solid', 'salmon-carousel-indicator:solid']);
  });

  for (const query of ['', 'scheme=dark', 'dir=rtl', 'effect=fade', 'autoPlay=100000&peek', 'indicators=dynamic&n=8', 'indicators=fraction', 'indicators=progress']) {
    test(`axe clean: ${query || 'default'}`, async ({ page }) => {
      await open(page, query);
      await expectClean(page, query || 'default');
      await page.getByRole('button', { name: 'Next slide' }).click();
      await expect(page.locator('.salmon-carousel-slide[data-active]')).toHaveAttribute('data-index', '1');
      await expectClean(page, `${query || 'default'} after next`);
    });
  }
});
