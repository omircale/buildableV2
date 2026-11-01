/**
 * One cell of a CSV file, safe to open in a spreadsheet.
 *
 * Two things are handled. Quoting, so a comma or a line break inside a description does not split the
 * row. And formulas: a spreadsheet treats a cell that begins with `=`, `+`, `-` or `@` as something to
 * run, and every bill this engine writes carries text typed by a person — a room's name, a finish's
 * name — and is then sent on to a contractor. A leading apostrophe makes the spreadsheet read such a
 * cell as text. Numbers are passed as numbers and are left alone, so a negative quantity stays one.
 */
export function csvCell(v: string | number): string {
  if (typeof v === 'number') return String(v);
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
