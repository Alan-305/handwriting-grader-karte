/** A4 印刷レイアウト定数（Safari / Chrome on Mac の不可印刷域を考慮） */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/** @page 余白（左右をやや広めにして右端欠けを防ぐ） */
export const PRINT_MARGIN_TOP_MM = 20;
export const PRINT_MARGIN_BOTTOM_MM = 20;
export const PRINT_MARGIN_LEFT_MM = 22;
export const PRINT_MARGIN_RIGHT_MM = 26;

export const PRINT_CONTENT_WIDTH_MM =
  A4_WIDTH_MM - PRINT_MARGIN_LEFT_MM - PRINT_MARGIN_RIGHT_MM;

export const PRINT_PAGE_MARGIN_CSS = `${PRINT_MARGIN_TOP_MM}mm ${PRINT_MARGIN_RIGHT_MM}mm ${PRINT_MARGIN_BOTTOM_MM}mm ${PRINT_MARGIN_LEFT_MM}mm`;

/** 画面プレビュー用（印刷時の可視幅と一致させる） */
export const PRINT_SCREEN_PADDING_CSS = `${PRINT_MARGIN_TOP_MM}mm ${PRINT_MARGIN_RIGHT_MM}mm ${PRINT_MARGIN_BOTTOM_MM}mm ${PRINT_MARGIN_LEFT_MM}mm`;
