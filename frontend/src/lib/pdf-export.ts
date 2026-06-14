import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  A4_WIDTH_MM,
  PRINT_CONTENT_WIDTH_MM,
  PRINT_PAGE_MARGIN_CSS,
  PRINT_SCREEN_PADDING_CSS,
} from "@/lib/print-page";

const PRINT_PAGE_SELECTOR = ".print-page";

function collectPrintPages(element: HTMLElement): HTMLElement[] {
  const pages = element.querySelectorAll<HTMLElement>(PRINT_PAGE_SELECTOR);
  if (pages.length > 0) return Array.from(pages);
  return [element];
}

/** 各 .print-page を A4 1枚ずつ PDF に出力 */
export async function exportElementToPdf(element: HTMLElement, filename: string) {
  const pages = collectPrintPages(element);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i += 1) {
    if (i > 0) pdf.addPage();

    const canvas = await html2canvas(pages[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pxToMm = pageWidth / canvas.width;
    const imgHeightMm = canvas.height * pxToMm;

    if (imgHeightMm <= pageHeight) {
      pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeightMm);
    } else {
      const scale = pageHeight / imgHeightMm;
      const w = pageWidth * scale;
      pdf.addImage(imgData, "PNG", (pageWidth - w) / 2, 0, w, pageHeight);
    }
  }

  pdf.save(filename);
}

function buildPrintStyles(): string {
  return `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: white; }

  @media screen {
    html, body {
      width: ${A4_WIDTH_MM}mm;
      max-width: ${A4_WIDTH_MM}mm;
      margin: 0 auto;
      overflow-x: hidden;
    }
    .print-flow-document {
      width: ${A4_WIDTH_MM}mm !important;
      max-width: ${A4_WIDTH_MM}mm !important;
      padding: ${PRINT_SCREEN_PADDING_CSS} !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      box-shadow: none !important;
    }
    .print-flow-document.print-layout-document[data-page-margin="wide"] {
      padding: 26mm 32mm !important;
    }
    .print-flow-document--answer-sheet .print-corner-mark {
      position: absolute !important;
    }
  }

  @media print {
    @page { size: A4 portrait; margin: ${PRINT_PAGE_MARGIN_CSS}; }
    html, body {
      width: auto !important;
      max-width: none !important;
      overflow: visible !important;
    }
    .print-flow-document {
      width: ${PRINT_CONTENT_WIDTH_MM}mm !important;
      max-width: ${PRINT_CONTENT_WIDTH_MM}mm !important;
      padding: 0 !important;
      margin: 0 auto !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }
    .print-flow-document *,
    .print-flow-document *::before,
    .print-flow-document *::after {
      box-sizing: border-box;
    }
    .print-flow-document table,
    .answer-sheet-japanese-grid,
    .answer-sheet-symbol-table,
    .answer-sheet-japanese-grid-wrap,
    .answer-sheet-field {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
    }
    .print-flow-document--answer-key .border,
    .print-flow-document--answer-key .border-2,
    .print-flow-document--answer-key .border-b {
      border-color: transparent !important;
    }
    .print-flow-document--answer-key .print-doc-header {
      border-bottom-color: #000 !important;
    }
    .print-flow-document--answer-key .rounded-lg,
    .print-flow-document--answer-key .bg-slate-50,
    .print-flow-document--answer-key .bg-slate-50\\/80 {
      border-radius: 0 !important;
      background: transparent !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
    }
    .answer-sheet-field:not(.answer-sheet-japanese-grid),
    .answer-sheet-japanese-grid-wrap {
      padding-left: 0 !important;
      padding-right: 0 !important;
    }
    .print-doc-header {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-bottom: 1.25rem;
    }
    .grading-print-document .print-doc-header {
      break-after: auto !important;
      page-break-after: auto !important;
      margin-bottom: 0.75rem;
    }
    .grading-print-document .print-question-wrap,
    .grading-print-document .print-question-block,
    .grading-print-document .grading-print-question,
    .grading-print-document .grading-print-block {
      break-inside: auto !important;
      page-break-inside: auto !important;
    }
    .print-flow-document--answer-key .print-doc-header {
      break-after: auto !important;
      page-break-after: auto !important;
      margin-bottom: 0.75rem !important;
    }
    .print-flow-document--answer-key .print-question-wrap,
    .print-flow-document--answer-key .print-question-block,
    .print-flow-document--answer-key .print-question-block--split-ok {
      break-inside: auto !important;
      page-break-inside: auto !important;
    }
    .print-layout-document {
      font-size: calc(1rem * var(--print-font-scale, 100%) / 100);
      line-height: var(--print-line-height, 1.55);
    }
    .print-layout-document :where(.text-explanation, .leading-relaxed) {
      line-height: var(--print-line-height, 1.55);
    }
    .print-question-block {
      margin-top: 1.25rem;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .grading-print-document .print-question-block,
    .grading-print-document .print-question-wrap,
    .print-question-block.print-question-block--split-ok {
      break-inside: auto !important;
      page-break-inside: auto !important;
    }
    .print-question-block:first-of-type { margin-top: 0; }
    .print-page {
      position: relative;
      width: 100%;
      min-height: 0;
      height: auto;
      padding: 0;
      box-sizing: border-box;
      overflow: visible;
      page-break-after: always;
      break-after: page;
      box-shadow: none !important;
    }
    .print-page:last-child { page-break-after: auto; break-after: auto; }
    .print-break-avoid { break-inside: avoid; page-break-inside: avoid; }
    .print-flow-document--answer-sheet .print-question-block {
      break-inside: auto;
      page-break-inside: auto;
    }
    .answer-sheet-japanese-grid,
    .answer-sheet-japanese-grid td,
    .answer-sheet-field,
    .answer-sheet-symbol-table th,
    .answer-sheet-symbol-table td {
      border-color: #111 !important;
    }
    .answer-sheet-japanese-grid { border-width: 0.75pt !important; }
    .answer-sheet-japanese-grid td { border-width: 0.5pt !important; }
    .answer-sheet-field { border-width: 1pt !important; }
    .answer-sheet-symbol-table th,
    .answer-sheet-symbol-table td { border-width: 0.5pt !important; }
    .print-corner-mark {
      position: fixed;
      z-index: 9999;
      width: 3mm;
      height: 3mm;
      box-sizing: border-box;
      border: 1px solid #000;
    }
    .print-corner-tl { top: 0; left: 0; }
    .print-corner-tr { top: 0; right: 0; }
    .print-corner-bl { bottom: 0; left: 0; }
    .print-corner-br { bottom: 0; right: 0; }
  }
`;
}

function getAppStylesheetHref(): string {
  const link = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find((el) =>
    (el as HTMLLinkElement).href.includes("/assets/index-"),
  );
  return link ? (link as HTMLLinkElement).href : "";
}

/** 印刷対象だけを iframe に載せて印刷（Mac Safari / Chrome 向けに CSS を隔離） */
export function printElement(element: HTMLElement) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    iframe.remove();
    return;
  }

  const cssHref = getAppStylesheetHref();
  const stylesheetLink = cssHref
    ? `<link rel="stylesheet" href="${cssHref}" crossorigin="anonymous" />`
    : "";

  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${A4_WIDTH_MM}mm" />
  <title></title>
  ${stylesheetLink}
  <style>${buildPrintStyles()}</style>
</head>
<body>${element.innerHTML}</body>
</html>`);
  doc.close();

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 1500);
  };

  const runPrint = () => {
    win.focus();
    win.print();
    cleanup();
  };

  if (!cssHref) {
    runPrint();
    return;
  }

  const link = doc.querySelector('link[rel="stylesheet"]');
  if (!link) {
    runPrint();
    return;
  }

  let printed = false;
  const runPrintOnce = () => {
    if (printed) return;
    printed = true;
    runPrint();
  };

  link.addEventListener("load", runPrintOnce, { once: true });
  link.addEventListener("error", runPrintOnce, { once: true });
  window.setTimeout(runPrintOnce, 2500);
}
