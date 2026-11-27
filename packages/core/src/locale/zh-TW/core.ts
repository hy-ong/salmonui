// zh-TW text of the @salmonui/core families (see ../zh-TW.ts): the shared
// form field validation messages and the dialog core (Dialog, AlertDialog,
// Drawer).

/** Validation messages of every form field; `{0}` / `{1}` are the rule arguments. */
export const validation = /* @__PURE__ */ Object.freeze({
  validationRequired: '此欄位為必填。',
  validationMin: '請輸入大於或等於 {0} 的值。',
  validationMax: '請輸入小於或等於 {0} 的值。',
  validationRange: '請輸入介於 {0} 和 {1} 之間的值。',
  validationMinLength: '請輸入至少 {0} 個字元。',
  validationMaxLength: '請輸入不超過 {0} 個字元。',
  validationRangeLength: '請輸入長度介於 {0} 到 {1} 個字元的值。',
  validationNumber: '請輸入有效的數字。',
  validationDigits: '請只輸入數字。',
  validationEmail: '請輸入有效的電子郵件地址。',
  validationUrl: '請輸入有效的 URL。',
  validationDate: '請輸入有效的日期。',
  validationDateIso: '請輸入有效的日期（ISO 格式）。',
  validationCreditcard: '請輸入有效的信用卡號碼。',
  validationTel: '請輸入有效的電話號碼。',
  validationPattern: '請輸入正確的值。',
  validationValidate: '請輸入正確的值。',
});

export const dialog = /* @__PURE__ */ Object.freeze({
  close: '關閉',
  moved: (position: { readonly x: number; readonly y: number }): string => `已移至 ${position.x}, ${position.y}`,
  resized: (size: { readonly width: number; readonly height: number }): string => `已調整大小為 ${size.width} × ${size.height}`,
  resize: '調整大小',
  // Logical edges named for left-to-right text (`start` is the left edge).
  resizeEdge: (edge: string): string => `調整大小（${EDGES[edge] ?? edge}）`,
});

const EDGES: Readonly<Record<string, string>> = { top: '上緣', bottom: '下緣', start: '左緣', end: '右緣', topStart: '左上角', topEnd: '右上角', bottomStart: '左下角', bottomEnd: '右下角' };
