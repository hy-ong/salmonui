// Locale families of @salmonui/query-builder (see ../locale-coverage.test.mjs).
export default {
  queryBuilder: {
    defaults: [
      { module: 'packages/query-builder/dist/query-builder/locale.js', export: 'QUERY_BUILDER_DEFAULT_LOCALE_TEXT' },
      // `validation<Rule>` keys override the core validation messages.
      { module: 'packages/core/dist/validation.js', export: 'DEFAULT_VALIDATION_MESSAGES', prefix: 'validation' },
    ],
  },
};
