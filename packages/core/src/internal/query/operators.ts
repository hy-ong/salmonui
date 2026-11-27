// Filter operator lists shared by the Data Grid filter UI and the Query
// Builder. Pure
// data: the server-safe converters import it too.

export const STRING_OPERATORS: readonly string[] = /* @__PURE__ */ Object.freeze([
  'contains', 'startsWith', 'endsWith', 'equal', 'notEqual', 'doesNotContain', 'doesNotStartWith', 'doesNotEndWith',
  'like', 'isEmpty', 'isNotEmpty', 'isNull', 'isNotNull',
]);
export const VALUE_OPERATORS: readonly string[] = /* @__PURE__ */ Object.freeze([
  'equal', 'notEqual', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'between', 'isNull', 'isNotNull',
]);
export const BOOLEAN_OPERATORS: readonly string[] = /* @__PURE__ */ Object.freeze(['equal', 'notEqual']);

/** Operators that take no value. */
export const NO_VALUE_OPERATORS: ReadonlySet<string> = /* @__PURE__ */ new Set(['isEmpty', 'isNotEmpty', 'isNull', 'isNotNull']);

/** Operators whose value is a list. */
export const LIST_OPERATORS: ReadonlySet<string> = /* @__PURE__ */ new Set(['in', 'notIn']);
