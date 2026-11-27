---
title: Speech To Text basics
description: A SpeechToTextButton that dictates into a TextArea in a chosen recognition language and reports start, stop and errors.
category: inputs
---

Pick a language, click the microphone and speak; the transcript replaces
the notes. The `lang` prop (a BCP 47 tag; without it, the document
language) sets the recognition language, so German speech is transcribed
as German. In a browser without the Web Speech API the button is disabled.
