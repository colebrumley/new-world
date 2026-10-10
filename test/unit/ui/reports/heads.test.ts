// The head of each report (R-1015): its adviser's seal and opening words.
import { describe, expect, it } from 'vitest';
import { hallReport } from '../../../../src/app/hall-of-fame';
import { INK, PALETTE, SEAL_GLYPHS } from '../../../../src/ui/pixel-art';
import { terrainReport } from '../../../../src/ui/reports/advisers';
import { REPORT_HEADS, reportHead } from '../../../../src/ui/reports/heads';

describe('the heads of the reports', () => {
  it('there is one for each of the ten advisers and for the Hall of Fame', () => {
    expect(Object.keys(REPORT_HEADS)).toEqual(['terrain', 'religion', 'congress', 'labor', 'economy', 'colonies', 'naval', 'foreign', 'indians', 'score', 'hall']);
    // the ids are the reports' own
    expect(reportHead(terrainReport().id)).toBe(REPORT_HEADS.terrain);
    expect(reportHead(hallReport([]).id)).toBe(REPORT_HEADS.hall);
  });

  it('each is sealed with one of the four marks in a wax from the palette, and all four marks are used', () => {
    for (const head of Object.values(REPORT_HEADS)) {
      expect(SEAL_GLYPHS).toContain(head.glyph);
      expect(PALETTE[head.wax]).toBeDefined();
    }
    expect(new Set(Object.values(REPORT_HEADS).map((h) => h.glyph)).size).toBe(SEAL_GLYPHS.length);
    // no two advisers close their reports with the same seal
    expect(new Set(Object.values(REPORT_HEADS).map((h) => `${h.glyph} ${h.wax}`)).size).toBe(Object.keys(REPORT_HEADS).length);
  });

  it('each opens with a sentence or two of its own, beginning with a capital for the drop cap', () => {
    const leads = Object.values(REPORT_HEADS).map((h) => h.lead);
    expect(new Set(leads).size).toBe(leads.length);
    for (const lead of leads) {
      expect(lead).toMatch(/^[A-Z]/);
      expect(lead).toMatch(/\.$/);
      expect(lead.length).toBeGreaterThan(80);
      expect(lead.length).toBeLessThan(240);
    }
  });

  it('a report without a head is sealed in plain red and opens without a word', () => {
    expect(reportHead('unknown')).toEqual({ glyph: 'quill', wax: INK.red, lead: '' });
    expect(reportHead('toString')).toEqual({ glyph: 'quill', wax: INK.red, lead: '' });
  });

  it('matches the snapshot', () => {
    expect(REPORT_HEADS).toMatchSnapshot();
  });
});
