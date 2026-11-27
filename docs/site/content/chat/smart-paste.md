---
title: Smart paste
description: useSmartPaste fills a form from pasted text - an address, an email, a support ticket - through your own adapter, with any Button. It describes the fields, writes the answer into React-controlled inputs and reports what it filled.
category: Components
order: 50
demos: [smart-paste]
---

Smart paste is a hook:
`useSmartPaste(formRef, adapter)` from `@salmonui/chat/smart-paste`. It
has no visual part and no stylesheet, so it works with any button; the
examples use the Buttons `Button`.

```tsx
import { useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import '@salmonui/buttons/button/styles.css';
import { useSmartPaste, type SmartPasteAdapter } from '@salmonui/chat/smart-paste';

const adapter: SmartPasteAdapter = async ({ clipboardText, fields }, { signal }) => {
  const response = await fetch('/api/smart-paste', { method: 'POST', body: JSON.stringify({ clipboardText, fields }), signal });
  return response.json(); // { name: 'Ada Lovelace', country: 'nl', ... }
};

function ContactForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const { paste, pending } = useSmartPaste(formRef, adapter);
  return (
    <form ref={formRef}>
      {/* your fields */}
      <Button loading={pending} onClick={() => paste().catch(() => {})}>
        Smart paste
      </Button>
    </form>
  );
}
```

The hook has no stylesheet of its own; import the stylesheet of the
button you use. Every option and type is in the
[API reference](/docs/reference/chat/smart-paste).

## The adapter

`adapter({ clipboardText, fields }, { signal })` is the only place a
model appears, and it is yours: call your server, which builds the
prompt and talks to the provider. It resolves an object keyed by field
`name`, or JSON text of one; text around the object (a Markdown code fence,
a sentence before it) is ignored. The adapter receives the pasted text and
the field descriptors, never other page data.

## Reading the clipboard

`paste()` reads `navigator.clipboard.readText()`. Call it directly
from the click handler: the read happens before the first `await`, inside
the user gesture, so the browser can show its permission prompt.
`paste(text)` skips the clipboard: use it when the Clipboard API is
unavailable or denied (fall back to a dialog with a textarea), or for text
from a drop or a file.

## Which fields are described

The hook looks at the `input`, `textarea` and `select` elements inside
`formRef` (a `<form>` or any container) and sends one descriptor per `name`:

| Descriptor field | Source |
| --- | --- |
| `name` | The control's `name` (or its `id`); the key of the answer. |
| `label` | The associated `<label>` (without the control's own text), `aria-labelledby`, `aria-label`, or the `<legend>` of a radio or checkbox group. |
| `description` | `data-salmon-paste-description` on the control or an ancestor, else the `aria-describedby` text (the description of a Salmon field). |
| `type` | The input `type`, or `textarea`, `select`. |
| `options`, `multiple` | `<option>` values, radio values, checkbox group values; `multiple` for a multiple select or a checkbox group. |

Skipped: anything inside `data-salmon-paste="off"`, password, file and
hidden inputs, buttons, disabled and read-only controls, and the hidden
mirror elements that custom fields render for forms (`aria-hidden` and out
of the tab order). Use `data-salmon-paste-description` to tell the model
what a field means ("Customer reference, format AB-1234").

## How fields are filled

Text inputs, textareas and selects are written through the element's
prototype `value` setter, followed by bubbling `input` and `change` events;
checkboxes and radios are clicked into the wanted state. React
sees both as user input, so React-controlled inputs update their state,
and the Inputs `TextField`, `TextArea`, `NumberField`, `Checkbox`,
`RadioGroup` and `Switch` work because they render native controls.
Select values match an option value first, then case-insensitively a value
or the option text; a checkbox accepts `true`, `"yes"`, `"on"`, `1`; a
checkbox group or multiple select accepts an array or a comma-separated
string.

Fields that are not native controls, such as the Dropdowns `Select` or a
`DatePicker`, are passed as custom fields: the hook describes them and
calls your `fill`:

```tsx
const [country, setCountry] = useState<string | null>(null);
const { paste } = useSmartPaste(formRef, adapter, {
  fields: [{ name: 'country', label: 'Country', type: 'select', options: ['nl', 'my'], fill: (value) => setCountry(String(value)) }],
});
```

Return `false` from `fill` when the value does not fit; the field is then
reported as skipped.

## Pending state and the result

`pending` is true while a paste waits for the clipboard or the adapter;
pass it to `Button` `loading`, which sets `aria-busy` and ignores
further presses. `paste()` resolves `{ filled, skipped }`: the names it
filled, and the described fields the answer left empty or that did not
accept the value. A new paste aborts the previous one (its `signal`
aborts, its promise rejects with an `AbortError`), and so does unmounting
the component; adapter and clipboard errors reject the promise too.

## Any Button

The hook only needs something to call `paste()`. Every Buttons capability
(content, icons, variants, `disabled`, `loading`, focus and click handling,
documented in the [Button](/docs/buttons/button) page) is the Button's own;
a plain `<button>` works as well.

## SSR

`useSmartPaste` is SSR-safe: it renders nothing, reads the form and the
clipboard only inside `paste()` (a click handler), and `pending` starts as
`false` on the server and the client, so the button's server markup and
the hydrated markup match.

## Design notes

The hook has no common component props: it has no element or
lifecycle of its own, so they belong to the `Button` and the form. It
renders no HTML strings, so it needs no sanitizer. Persist what `paste()`
filled through your form state, set `dir` on an ancestor, style the
`Button` with `className`, and use an effect for setup and teardown.
