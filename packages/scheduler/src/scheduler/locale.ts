// `localeText` of the Scheduler: the Data Grid message
// format (`{param}` placeholders, plural forms), English defaults.

import type { LocaleMessage } from '@salmonui/core/internal/dates/index';

export interface SchedulerLocaleText {
  readonly label: LocaleMessage;
  readonly previous: LocaleMessage;
  readonly next: LocaleMessage;
  readonly today: LocaleMessage;
  readonly newEvent: LocaleMessage;
  readonly views: LocaleMessage;
  /** Resource picker of the adaptive layout. */
  readonly resource: LocaleMessage;
  readonly chooseDate: LocaleMessage;
  readonly viewDay: LocaleMessage;
  readonly viewWeek: LocaleMessage;
  readonly viewWorkWeek: LocaleMessage;
  readonly viewMonth: LocaleMessage;
  readonly viewYear: LocaleMessage;
  readonly viewAgenda: LocaleMessage;
  readonly viewMonthAgenda: LocaleMessage;
  readonly viewTimelineDay: LocaleMessage;
  readonly viewTimelineWeek: LocaleMessage;
  readonly viewTimelineWorkWeek: LocaleMessage;
  readonly viewTimelineMonth: LocaleMessage;
  readonly viewTimelineYear: LocaleMessage;
  readonly allDay: LocaleMessage;
  readonly expandAllDay: LocaleMessage;
  readonly collapseAllDay: LocaleMessage;
  readonly more: LocaleMessage;
  readonly moreEventsTitle: LocaleMessage;
  readonly noTitle: LocaleMessage;
  readonly eventLabel: LocaleMessage;
  readonly cellLabel: LocaleMessage;
  readonly weekNumber: LocaleMessage;
  readonly loading: LocaleMessage;
  readonly addTitle: LocaleMessage;
  readonly save: LocaleMessage;
  readonly cancel: LocaleMessage;
  readonly delete: LocaleMessage;
  readonly edit: LocaleMessage;
  readonly close: LocaleMessage;
  readonly moreDetails: LocaleMessage;
  readonly newEventTitle: LocaleMessage;
  readonly editEventTitle: LocaleMessage;
  readonly fieldTitle: LocaleMessage;
  readonly fieldLocation: LocaleMessage;
  readonly fieldStart: LocaleMessage;
  readonly fieldEnd: LocaleMessage;
  readonly fieldAllDay: LocaleMessage;
  readonly fieldTimeZone: LocaleMessage;
  readonly fieldStartTimeZone: LocaleMessage;
  readonly fieldEndTimeZone: LocaleMessage;
  readonly fieldRepeat: LocaleMessage;
  readonly fieldDescription: LocaleMessage;
  readonly recurrenceEditTitle: LocaleMessage;
  readonly recurrenceDeleteTitle: LocaleMessage;
  readonly recurrenceEditMessage: LocaleMessage;
  readonly recurrenceDeleteMessage: LocaleMessage;
  readonly scopeOccurrence: LocaleMessage;
  readonly scopeFollowing: LocaleMessage;
  readonly scopeSeries: LocaleMessage;
  readonly deleteTitle: LocaleMessage;
  readonly deleteMessage: LocaleMessage;
  readonly overlapTitle: LocaleMessage;
  readonly overlapMessage: LocaleMessage;
  readonly blockedMessage: LocaleMessage;
  readonly validationTitle: LocaleMessage;
  readonly durationTooLong: LocaleMessage;
  readonly sameDay: LocaleMessage;
  readonly occurrenceOverlap: LocaleMessage;
  readonly invalidRule: LocaleMessage;
  readonly endBeforeStart: LocaleMessage;
  readonly required: LocaleMessage;
  readonly minLength: LocaleMessage;
  readonly maxLength: LocaleMessage;
  readonly pattern: LocaleMessage;
  readonly ok: LocaleMessage;
  readonly currentTime: LocaleMessage;
  readonly noEvents: LocaleMessage;
  /** Default cell context menu item. */
  readonly newRecurringEvent: LocaleMessage;
}

export const SCHEDULER_DEFAULT_LOCALE_TEXT: SchedulerLocaleText = Object.freeze({
  label: 'Scheduler',
  previous: 'Previous',
  next: 'Next',
  today: 'Today',
  newEvent: 'New event',
  views: 'Views',
  resource: 'Resource',
  chooseDate: 'Choose date',
  viewDay: 'Day',
  viewWeek: 'Week',
  viewWorkWeek: 'Work week',
  viewMonth: 'Month',
  viewYear: 'Year',
  viewAgenda: 'Agenda',
  viewMonthAgenda: 'Month agenda',
  viewTimelineDay: 'Timeline day',
  viewTimelineWeek: 'Timeline week',
  viewTimelineWorkWeek: 'Timeline work week',
  viewTimelineMonth: 'Timeline month',
  viewTimelineYear: 'Timeline year',
  allDay: 'All day',
  expandAllDay: 'Expand all-day section',
  collapseAllDay: 'Collapse all-day section',
  more: { one: '+{count} more', other: '+{count} more' },
  moreEventsTitle: 'Events on {date}',
  noTitle: '(No title)',
  eventLabel: '{title}, {time}',
  cellLabel: '{time}',
  weekNumber: 'Week {week}',
  loading: 'Loading events',
  addTitle: 'Add title',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  edit: 'Edit',
  close: 'Close',
  moreDetails: 'More details',
  newEventTitle: 'New event',
  editEventTitle: 'Edit event',
  fieldTitle: 'Title',
  fieldLocation: 'Location',
  fieldStart: 'Start',
  fieldEnd: 'End',
  fieldAllDay: 'All day',
  fieldTimeZone: 'Time zone',
  fieldStartTimeZone: 'Start time zone',
  fieldEndTimeZone: 'End time zone',
  fieldRepeat: 'Repeat',
  fieldDescription: 'Description',
  recurrenceEditTitle: 'Edit recurring event',
  recurrenceDeleteTitle: 'Delete recurring event',
  recurrenceEditMessage: 'Edit only this event, this and the following events, or the whole series?',
  recurrenceDeleteMessage: 'Delete only this event, this and the following events, or the whole series?',
  scopeOccurrence: 'This event',
  scopeFollowing: 'This and following events',
  scopeSeries: 'All events',
  deleteTitle: 'Delete event',
  deleteMessage: 'Are you sure you want to delete this event?',
  overlapTitle: 'Time slot not available',
  overlapMessage: 'Events cannot be scheduled during this time because another event or a block is already there.',
  blockedMessage: 'This time is blocked.',
  validationTitle: 'Cannot save',
  durationTooLong: 'The event lasts longer than how often it repeats.',
  sameDay: 'Two occurrences of the same event cannot be on the same day.',
  occurrenceOverlap: 'An occurrence cannot move past another occurrence of the same event.',
  invalidRule: 'The repeat rule is not valid.',
  endBeforeStart: 'The end must be after the start.',
  required: 'This field is required.',
  minLength: 'Enter at least {min} characters.',
  maxLength: 'Enter at most {max} characters.',
  pattern: 'Enter a value in the expected format.',
  ok: 'OK',
  currentTime: 'Current time',
  noEvents: 'No events',
  newRecurringEvent: 'New recurring event',
});
