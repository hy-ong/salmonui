// Dialog family server markup. Interaction tests: tests/browser/dialog.spec.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { AlertDialog, Dialog, DialogBody, DialogFooter, DialogProvider, DialogTitle, useConfirm } from '@salmonui/overlays/dialog';
import { Drawer, DrawerTitle } from '@salmonui/overlays/drawer';

const html = (el: ReactElement) => renderToString(el);
const trigger = h(Dialog.Trigger, null, 'Edit');

describe('Dialog markup', () => {
  it('a closed dialog renders only its trigger (aria-haspopup, aria-expanded)', () => {
    assert.equal(html(h(Dialog, { trigger }, h(DialogTitle, null, 'Edit order'))), '<button aria-haspopup="dialog" aria-expanded="false" type="button" class="salmon-dialog-trigger">Edit</button>');
  });

  it('keepMounted renders the closed <dialog> without open, with its parts and close button', () => {
    const out = html(
      h(Dialog, { keepMounted: true, closeButton: true, title: 'Edit order', localeText: { close: 'Fermer' } }, h(Dialog.Description, null, 'Saved on submit.'), h(DialogBody, null, 'Body'), h(DialogFooter, null, h(Dialog.Close, null, 'Cancel'))),
    );
    assert.match(out, /^<dialog class="salmon-dialog" data-kind="dialog" data-placement="center" data-modal="">/);
    assert.doesNotMatch(out, /<dialog[^>]* open/);
    assert.match(out, /<button type="button" class="salmon-dialog-close-button" aria-label="Fermer">/);
    assert.match(out, /<h2 id="[^"]+-title" class="salmon-dialog-title">Edit order<\/h2><p id="[^"]+-description" class="salmon-dialog-description">Saved on submit.<\/p>/);
    assert.match(out, /<div class="salmon-dialog-body">Body<\/div><div class="salmon-dialog-footer"><button type="button" class="salmon-dialog-close">Cancel<\/button><\/div>/);
  });

  it('SSR: a modal defaultOpen dialog renders <dialog> without open (showModal after hydration); a modeless one renders open', () => {
    const modal = html(h(Dialog, { defaultOpen: true }, 'x'));
    assert.match(modal, /^<dialog class="salmon-dialog"/);
    assert.doesNotMatch(modal, /<dialog[^>]* open/);
    assert.match(html(h(Dialog, { defaultOpen: true, modal: false }, 'x')), /^<dialog open="" class="salmon-dialog"/);
  });

  it('placement, position, width / height / minHeight and fullScreen hooks', () => {
    const out = html(h(Dialog, { keepMounted: true, placement: 'top', defaultPosition: { x: 10, y: 20 }, width: 480, height: '50vh', minHeight: 200, fullScreen: 'mobile' }, 'x'));
    assert.match(out, /data-placement="top"/);
    assert.match(out, /data-full-screen="mobile"/);
    assert.match(out, /style="width:480px;height:50vh;min-height:200px;--salmon-dialog-x:10px;--salmon-dialog-y:20px"/);
    assert.match(html(h(Dialog, { keepMounted: true, fullScreen: true }, 'x')), /data-full-screen="always"/);
  });

  it('Drawer: a dialog docked to a logical side with its size variable', () => {
    const out = html(h(Drawer, { keepMounted: true, side: 'end', size: 280, title: 'Filters' }));
    assert.match(out, /^<dialog style="--salmon-drawer-size:280px" class="salmon-drawer salmon-dialog" data-kind="drawer" data-side="end" data-modal=""|^<dialog class="salmon-drawer salmon-dialog" data-kind="drawer" data-side="end" data-modal="" style="--salmon-drawer-size:280px"/);
    assert.equal(Drawer.Title, Dialog.Title);
    assert.equal(DrawerTitle, Dialog.Title);
  });
});

describe('AlertDialog markup', () => {
  it('role alertdialog, labels from props and localeText, Cancel focused first', () => {
    const out = html(h(AlertDialog, { keepMounted: true, title: 'Delete?', description: 'Gone for good.', cancelLabel: 'Keep', tone: 'danger', localeText: { ok: 'Oui' } }));
    assert.match(out, /^<dialog role="alertdialog" class="salmon-dialog" data-kind="alert"/);
    assert.match(out, /data-autofocus="".*>.*Keep/);
    assert.match(out, /data-tone="danger"[^>]*>.*Oui/);
    const alert = html(h(AlertDialog, { keepMounted: true, title: 'Saved' }));
    assert.equal((alert.match(/<button/g) ?? []).length, 1);
  });

  it('async confirm: no error region before a rejection; the dialog stylesheet styles it', () => {
    const out = html(h(AlertDialog, { keepMounted: true, title: 'Publish?', cancelLabel: 'Cancel', onConfirm: () => Promise.reject(new Error('x')) }));
    assert.doesNotMatch(out, /role="alert"|salmon-alert-dialog-error/);
    assert.match(readFileSync(new URL('../dist/dialog.css', import.meta.url), 'utf8'), /\.salmon-alert-dialog-error \{[^}]*color: var\(--salmon-color-danger-text\)/);
  });

  it('DialogProvider renders nothing of its own on the server; useConfirm needs it', () => {
    assert.equal(html(h(DialogProvider, null, h('p', null, 'app'))), '<p>app</p>');
    const Bad = () => {
      useConfirm();
      return null;
    };
    assert.throws(() => html(h(Bad)), /needs a <DialogProvider>/);
  });

  it('stylesheets: dialog.css and drawer.css carry the dialog core; the core theme does not', () => {
    // /dialog/styles.css is the Button stylesheet (AlertDialog), the dialog core, then its own rules;
    // /drawer/styles.css is the dialog core, then the drawer rules.
    const dialog = readFileSync(new URL('../dist/dialog.css', import.meta.url), 'utf8');
    const drawerCss = readFileSync(new URL('../dist/drawer.css', import.meta.url), 'utf8');
    const coreStyles = readFileSync(new URL(import.meta.resolve('@salmonui/core/styles.css')), 'utf8');
    const core = readFileSync(new URL('../../core/styles/dialog-core.css', import.meta.url), 'utf8');
    const drawer = readFileSync(new URL('../../core/styles/drawer.css', import.meta.url), 'utf8');
    const own = readFileSync(new URL('../styles/dialog.css', import.meta.url), 'utf8');
    assert.ok(!coreStyles.includes('.salmon-dialog') && !coreStyles.includes('.salmon-drawer'));
    // Each module sits in its cascade layer, the dialog core below the own rules.
    const before = (css: string, a: string, b: string): boolean => css.includes(a) && css.includes(b) && css.indexOf(a) < css.indexOf(b);
    assert.ok(before(dialog, core, own), 'dialog.css carries the dialog core before its own rules');
    assert.match(dialog, /\.salmon-button:focus-visible/, 'dialog.css carries the Button rules');
    assert.doesNotMatch(dialog, /\.salmon-drawer\b/);
    assert.ok(before(drawerCss, core, drawer) && !drawerCss.includes(own));
    assert.match(drawer, /\.salmon-drawer\b/);
    for (const css of [core, drawer]) assert.match(css, /prefers-reduced-motion/);
    for (const css of [own, core, drawer]) {
      assert.doesNotMatch(css, /@import/);
      assert.doesNotMatch(css, /(?<![-\w])(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/);
    }
    assert.ok(readFileSync(new URL('../dist/styles.css', import.meta.url), 'utf8').includes(own));
  });
});
