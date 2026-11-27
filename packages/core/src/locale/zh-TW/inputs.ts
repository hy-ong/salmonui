// zh-TW text of the @salmonui/inputs families (see ../zh-TW.ts). The
// `validation*` keys of every field are the `validation` family (./core.ts).

/** The parts of a color the names below read (structural, so core needs no inputs types). */
export interface ColorLike {
  readonly hue: number;
  readonly alpha: number;
  toHsl(): { readonly s: number; readonly l: number };
}

// Hue ranges of the English description in @salmonui/inputs (color.ts), in degrees.
const HUES: readonly (readonly [number, string])[] = [
  [15, '紅'],
  [45, '橙'],
  [70, '黃'],
  [100, '黃綠'],
  [155, '綠'],
  [190, '青'],
  [250, '藍'],
  [285, '紫'],
  [330, '洋紅'],
  [345, '粉紅'],
  [361, '紅'],
];

/** The hue's name for the hue slider's `aria-valuetext` (「綠色」). Not exported, like `colorName`. */
const hueOf = (hue: number): string => HUES.find(([end]) => hue < end)?.[1] ?? '紅';
const hueName = (hue: number): string => `${hueOf(hue)}色`;

/**
 * A Traditional Chinese description of a color for `aria-valuetext` and
 * swatch names (「深鮮綠色」, 「淺灰色」, 「透明」). Not exported: every named
 * export of this file is a catalog family.
 */
function colorName(color: ColorLike): string {
  if (color.alpha === 0) return '透明';
  const { s, l } = color.toHsl();
  const lightness = l < 22 ? '極深' : l < 38 ? '深' : l > 85 ? '極淺' : l > 65 ? '淺' : '';
  let name: string;
  if (l < 6) name = '黑色';
  else if (l > 97) name = '白色';
  else if (s < 10) name = `${lightness}灰色`;
  else {
    const hue = hueOf(color.hue);
    const brown = (hue === '橙' || hue === '紅') && l < 38 && s < 85;
    name = `${lightness}${s < 35 ? '灰' : s > 85 ? '鮮' : ''}${brown ? '棕' : hue}色`;
  }
  return color.alpha < 1 ? `${name}，不透明度 ${Math.round(color.alpha * 100)}%` : name;
}

export const textField = /* @__PURE__ */ Object.freeze({
  clear: '清除',
});

export const maskedField = /* @__PURE__ */ Object.freeze({
  clear: '清除',
  incomplete: '請填寫完整的值。',
});

export const numberField = /* @__PURE__ */ Object.freeze({
  increment: '增加',
  decrement: '減少',
  clear: '清除',
});

export const otpField = /* @__PURE__ */ Object.freeze({
  incomplete: '請輸入全部 {0} 個字元',
});

export const rating = /* @__PURE__ */ Object.freeze({
  item: '{0} 顆星，共 {1} 顆',
  clear: '清除評分',
});

export const slider = /* @__PURE__ */ Object.freeze({
  start: '最小值',
  end: '最大值',
});

export const fileUpload = /* @__PURE__ */ Object.freeze({
  browse: '瀏覽或拖放檔案',
  uploadAll: '上傳',
  clearAll: '清除',
  removeFile: '移除 {0}',
  cancelFile: '取消 {0}',
  retryFile: '重試 {0}',
  filesAdded: '已新增 {0} 個檔案',
  queued: '就緒',
  uploading: '上傳中',
  uploaded: '已上傳',
  error: '上傳失敗',
  canceled: '已取消',
  type: '不允許的檔案類型',
  tooSmall: '小於 {0}',
  tooLarge: '大於 {0}',
  tooMany: '超過 {0} 個檔案',
  upload: '上傳失敗',
  remove: '移除失敗',
});

export const signaturePad = /* @__PURE__ */ Object.freeze({
  empty: '簽名，空白',
  signed: '簽名，已簽署',
  typeMode: '輸入姓名',
  typeLabel: '姓名',
  clear: '清除',
});

export const colorPicker = /* @__PURE__ */ Object.freeze({
  trigger: '色彩',
  dialog: '色彩選擇器',
  area: '飽和度與亮度',
  colors: '色彩',
  recentColors: '最近使用的色彩',
  noColor: '無色彩',
  apply: '套用',
  cancel: '取消',
  current: '目前',
  previous: '先前',
  clear: '清除',
  hex: 'Hex',
  switchToSwatches: '顯示色票',
  switchToArea: '顯示色彩區域',
  saturation: '飽和度',
  brightness: '亮度',
  hue: '色相',
  alpha: '不透明度',
  colorName,
  hueName,
});

export const colorArea = /* @__PURE__ */ Object.freeze({
  saturation: '飽和度',
  brightness: '亮度',
  colorName,
});

export const colorSlider = /* @__PURE__ */ Object.freeze({
  hue: '色相',
  alpha: '不透明度',
  hueName,
});

export const colorField = /* @__PURE__ */ Object.freeze({
  clear: '清除',
});

export const colorSwatchPicker = /* @__PURE__ */ Object.freeze({
  noColor: '無色彩',
  colorName,
});

export const speechToText = /* @__PURE__ */ Object.freeze({
  label: '語音轉文字',
  start: '開始聆聽',
  stop: '停止聆聽',
  unsupported: '此瀏覽器不支援語音辨識',
});

export const formRenderer = /* @__PURE__ */ Object.freeze({
  submit: '送出',
});
