// Locale families of @salmonui/notifications (see ../locale-coverage.test.mjs).
// Badge, Progress and Spinner are server components: they cannot read a
// LocaleProvider, so Badge and Progress keep their explicit `locale` prop.
export default {
  toaster: { keys: ['notifications', 'dismiss'] },
  message: { keys: ['dismiss'] },
};
