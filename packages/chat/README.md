# @salmonui/chat

Conversation, InlineAssist, TextSuggest and SmartPaste for Salmon UI with provider-agnostic AI adapters.

```sh
npm install @salmonui/chat @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Conversation, ConversationComposer } from '@salmonui/chat/conversation';
import { InlineAssist } from '@salmonui/chat/inline-assist';
import { useTextSuggest } from '@salmonui/chat/text-suggest';
```

Import the theme stylesheet once per application, then the
stylesheet of each family you use:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/chat/conversation/styles.css';
```

Each family has its own `@salmonui/chat/<family>/styles.css` (`@salmonui/chat/smart-paste`
is a hook and has none).
A family stylesheet carries its own rules and those of every family and shared
module it renders, so it is the only stylesheet that family needs.

Public entry points:

- `@salmonui/chat/conversation`
- `@salmonui/chat/inline-assist`
- `@salmonui/chat/text-suggest`
- `@salmonui/chat/smart-paste`

## License

MIT
