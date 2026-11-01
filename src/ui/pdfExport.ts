import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';

/**
 * Rasterizes `el` (via html2canvas, so Hebrew/RTL text renders exactly as the browser shapes it —
 * jsPDF's own text API has no Hebrew glyphs) and slices the result across A4 pages of a real,
 * downloadable PDF file. No print dialog involved.
 */
export async function exportElementToPdf(el: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const imgWidthMm = pageWidthMm;
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

  let heightLeftMm = imgHeightMm;
  let yMm = 0;
  pdf.addImage(imgData, 'JPEG', 0, yMm, imgWidthMm, imgHeightMm);
  heightLeftMm -= pageHeightMm;
  while (heightLeftMm > 0) {
    yMm = heightLeftMm - imgHeightMm;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, yMm, imgWidthMm, imgHeightMm);
    heightLeftMm -= pageHeightMm;
  }
  pdf.save(filename);
}

/**
 * Exports an element made of fixed-size A4 page sections (`[data-pdf-page]`), one PDF page per section, so page
 * breaks never cut a step drawing in half. The element may be hidden; it is shown off-screen while rendering.
 */
export async function exportPagesToPdf(root: HTMLElement, filename: string): Promise<void> {
  const previousClass = root.className;
  const previousStyle = root.getAttribute('style');
  root.className = '';
  Object.assign(root.style, { position: 'fixed', left: '-10000px', top: '0', width: '210mm' });
  try {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pages = [...root.querySelectorAll<HTMLElement>('[data-pdf-page]')];
    for (const [i, page] of pages.entries()) {
      const canvas = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff' });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
    }
    pdf.save(filename);
  } finally {
    root.className = previousClass;
    if (previousStyle == null) root.removeAttribute('style');
    else root.setAttribute('style', previousStyle);
  }
}
