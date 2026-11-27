# @salmonui/inputs

Form, text, masked and number fields, FileUpload, Checkbox, RadioGroup, Switch, Rating, OtpField, Slider, SignaturePad, ColorPicker, SpeechToText and FormRenderer for Salmon UI.

```sh
npm install @salmonui/inputs @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Form, Field } from '@salmonui/inputs/form';
import { TextField } from '@salmonui/inputs/text-field';
import { NumberField } from '@salmonui/inputs/number-field';
```

Import the theme stylesheet once per application, then the
stylesheet of each family you use:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/inputs/form/styles.css';
```

Each family has its own `@salmonui/inputs/<family>/styles.css`.
A family stylesheet carries its own rules and those of every family and shared
module it renders, so it is the only stylesheet that family needs.

Public entry points:

- `@salmonui/inputs/form`
- `@salmonui/inputs/text-field`
- `@salmonui/inputs/masked-field`
- `@salmonui/inputs/number-field`
- `@salmonui/inputs/file-upload`
- `@salmonui/inputs/file-upload/xhr`
- `@salmonui/inputs/checkbox`
- `@salmonui/inputs/radio-group`
- `@salmonui/inputs/switch`
- `@salmonui/inputs/rating`
- `@salmonui/inputs/otp-field`
- `@salmonui/inputs/slider`
- `@salmonui/inputs/signature-pad`
- `@salmonui/inputs/color-picker`
- `@salmonui/inputs/speech-to-text`
- `@salmonui/inputs/form-renderer`

## Documentation

- Component guides and API reference: <https://salmonui.dev>

## License

MIT
