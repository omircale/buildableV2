import { describe, expect, it } from 'vitest';
import { cellRef, sheetXml, workbookParts } from './xlsxFile';

describe('the workbook file', () => {
  it('names cells the way Excel does', () => {
    expect(cellRef(0, 0)).toBe('A1');
    expect(cellRef(25, 9)).toBe('Z10');
    expect(cellRef(26, 0)).toBe('AA1');
  });

  it('writes numbers as numbers and everything else as text — never as a formula', () => {
    const xml = sheetXml({ name: 's', widths: [10], rows: [['=HYPERLINK("http://x","click")', 12.5, '']] }, true);
    expect(xml).toContain('<c r="B1"><v>12.5</v></c>');
    expect(xml).toContain('t="inlineStr"');
    expect(xml).not.toContain('<f>');
    expect(xml).toContain('=HYPERLINK(&quot;http://x&quot;,&quot;click&quot;)');
    expect(xml).not.toContain('r="C1"');
  });

  it('escapes what would break the file and drops characters XML cannot carry', () => {
    const xml = sheetXml({ name: 's', widths: [], rows: [['a < b & c > d\u0001']] }, false);
    expect(xml).toContain('a &lt; b &amp; c &gt; d');
    expect(xml).not.toContain('\u0001');
  });

  it('a Hebrew workbook opens right to left', () => {
    expect(sheetXml({ name: 's', widths: [], rows: [] }, true)).toContain('rightToLeft="1"');
    expect(sheetXml({ name: 's', widths: [], rows: [] }, false)).not.toContain('rightToLeft');
  });

  it('lists every sheet in the workbook, its relationships and its content types', () => {
    const parts = workbookParts(
      [
        { name: 'סיכום', widths: [], rows: [] },
        { name: '08 "חשמל"', widths: [], rows: [] },
      ],
      true,
    );
    expect(Object.keys(parts)).toContain('xl/worksheets/sheet2.xml');
    expect(parts['xl/workbook.xml']).toContain('name="08 &quot;חשמל&quot;"');
    expect(parts['xl/_rels/workbook.xml.rels']).toContain('worksheets/sheet2.xml');
    expect(parts['[Content_Types].xml']).toContain('/xl/worksheets/sheet2.xml');
  });
});
