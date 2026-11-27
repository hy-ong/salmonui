// Modal host: `showModal()` makes everything outside the top-layer `<dialog>`
// inert, so a popup portaled to the body or the theme scope while a modal
// dialog is open would be visible but unclickable and hidden from assistive
// technology. Popups whose anchor lives in an open modal dialog portal into
// that dialog instead; shown with the Popover API after the dialog, they
// stack above it in the top layer (whose containing block is the viewport,
// so the dialog's transform and overflow do not clip them). A DOM read after
// hydration (popups never render on the server), at event time, in effects
// or in an external-store snapshot; never in a render body; no module state.
//
// `:modal` is a selector syntax error before Chrome 105, Firefox 103 and
// Safari 15.6 (`closest()` throws). The browser matrix names no floor,
// so both helpers fall back: to the theme
// scope, and to no modal host.

/** The nearest open modal `<dialog>` (`:modal`, which also matches a fullscreen element) or `ThemeProvider` scope. */
export const PORTAL_SCOPE = ':modal,.salmon-theme-scope';

/**
 * Portal target of a popup anchored at `el`: `el.closest(PORTAL_SCOPE)`, else
 * its document body. The nearer of a modal dialog and a theme scope is inside
 * the dialog when there is one (a theme scope nearer than the dialog lies
 * inside it), and theme variables inherit into a dialog placed in a theme scope.
 */
export function portalScopeOf(el: Element): Element {
  try {
    return el.closest(PORTAL_SCOPE) ?? el.ownerDocument.body;
  } catch {
    return el.closest('.salmon-theme-scope') ?? el.ownerDocument.body;
  }
}

/** The open modal `<dialog>` around `el` (nearest, `el` included), else null: for popups that default to the body. */
export function modalHostOf(el: unknown): Element | null {
  try {
    return (el as Element | null)?.closest?.(':modal') ?? null;
  } catch {
    return null;
  }
}
