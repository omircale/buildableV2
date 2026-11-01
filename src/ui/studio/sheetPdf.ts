/**
 * An A3 sheet, drawn as SVG, written into a real PDF file.
 *
 * The sheet is rasterised by the browser itself, so Hebrew is shaped and ordered exactly as on screen —
 * jsPDF's own text has no Hebrew glyphs. At 200 dpi a 0.4 mm line is still crisp on paper, and the canvas
 * stays under the size limit phones put on one (an A3 at 300 dpi would not).
 */
const DPI = 200;

export async function downloadSheetPdf(svg: string, widthMm: number, heightMm: number, filename: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('sheet did not render'));
      img.src = url;
    });
    const k = DPI / 25.4;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(widthMm * k);
    canvas.height = Math.round(heightMm * k);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pdf = new jsPDF({ orientation: widthMm > heightMm ? 'landscape' : 'portrait', unit: 'mm', format: [widthMm, heightMm], compress: true });
    // Without compression the page is stored as raw pixels: an A3 comes out at over 20 MB instead of ~150 KB.
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST');
    pdf.save(filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
