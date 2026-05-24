import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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

const PRINT_STYLES = `
  body { margin: 0; background: white; }
  @page { size: A4 portrait; margin: 20mm 24mm; }
  .print-flow-document {
    width: 100%;
    max-width: none;
    padding: 0;
    margin: 0;
    box-shadow: none !important;
  }
  .print-doc-header {
    break-inside: avoid;
    page-break-inside: avoid;
    margin-bottom: 1.25rem;
  }
  .print-question-block {
    margin-top: 1.25rem;
    break-inside: avoid;
    page-break-inside: avoid;
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
`;

export function printElement(element: HTMLElement) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((el) => el.outerHTML)
    .join("\n");
  printWindow.document.write(`
    <html><head><title>Print</title>${styles}
    <style>${PRINT_STYLES}</style></head><body>${element.innerHTML}</body></html>
  `);
  printWindow.document.close();

  const runPrint = () => {
    printWindow.focus();
    printWindow.print();
  };

  const links = Array.from(printWindow.document.querySelectorAll('link[rel="stylesheet"]'));
  if (links.length === 0) {
    runPrint();
    return;
  }

  let pending = links.length;
  let printed = false;
  const runPrintOnce = () => {
    if (printed) return;
    printed = true;
    runPrint();
  };

  const onReady = () => {
    pending -= 1;
    if (pending <= 0) runPrintOnce();
  };

  links.forEach((link) => {
    const el = link as HTMLLinkElement;
    if (el.sheet) onReady();
    else {
      el.addEventListener("load", onReady);
      el.addEventListener("error", onReady);
    }
  });

  // Stylesheet が読み込まれない場合の保険
  printWindow.setTimeout(runPrintOnce, 2000);
}
