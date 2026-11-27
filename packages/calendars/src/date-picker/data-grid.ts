'use client';

// `@salmonui/calendars/date-picker/data-grid`:
// `datePickerEditor`, an opt-in Data Grid `renderEditor` built on
// the public `DatePicker`. A separate subpath so neither the date-picker entry
// nor any Data Grid bundle carries it. CSS:
// `@salmonui/calendars/date-picker/styles.css`.

export { DATE_PICKER_EDITOR_PROPS, datePickerEditor } from './grid-editor.js';
export type { DatePickerEditorContext, DatePickerEditorOptions } from './grid-editor.js';
