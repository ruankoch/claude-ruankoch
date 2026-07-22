import { describe, expect, it } from 'vitest';
import { parseSheetMatrix } from './sheetSync';

describe('parseSheetMatrix', () => {
  it('parses set rows and skips the header', () => {
    const m: unknown[][] = [
      ['date', 'exercise', 'weight', 'reps', 'rpe', 'miss', 'source', 'id'],
      ['2025-03-29', 'Low Bar Squat', 230, 1, '', '', 'meet', 'a1'],
      ['2025-01-10', 'Deadlift', 200, 5, 8, '', '', 'b2'],
    ];
    const { sets, tombstones } = parseSheetMatrix(m);
    expect(tombstones.size).toBe(0);
    expect(sets).toHaveLength(2);
    expect(sets[0]).toMatchObject({ id: 'a1', name: 'Low Bar Squat', weight: 230, source: 'meet' });
    expect(sets[1]).toMatchObject({ id: 'b2', reps: 5, rpe: 8, source: '' });
  });

  it('collects delete tombstones by id', () => {
    const m: unknown[][] = [
      ['2025-01-10', 'Deadlift', 200, 5, 8, '', '', 'keep'],
      ['2025-01-10', 'Deadlift', 999, 1, '', '', 'delete', 'gone'],
    ];
    const { sets, tombstones } = parseSheetMatrix(m);
    expect(sets.map((s) => s.id)).toEqual(['keep']);
    expect([...tombstones]).toEqual(['gone']);
  });

  it('handles header-less matrices and numeric cell types', () => {
    const m: unknown[][] = [['2025-02-01', 'Bench Press', 100, 5, 7.5, '', '', 'x1']];
    const { sets } = parseSheetMatrix(m);
    expect(sets[0]).toMatchObject({ date: '2025-02-01', weight: 100, reps: 5, rpe: 7.5 });
  });

  it('flags miss rows and maps historic source', () => {
    const m: unknown[][] = [
      ['2020-01-01', 'Squat', 180, 3, '', '', 'historic', 'h1'],
      ['2025-02-01', 'Bench Press', 120, 1, '', 1, '', 'm1'],
    ];
    const { sets } = parseSheetMatrix(m);
    expect(sets[0].source).toBe('historic');
    expect(sets[1].miss).toBe(true);
  });

  it('extracts the latest training-maxes row and keeps it out of sets', () => {
    const m: unknown[][] = [
      ['date', 'exercise', 'weight', 'reps', 'rpe', 'miss', 'source', 'id'],
      ['2025-07-01', 'Training maxes', 220, 145, 270, '', 'tm', 'tm-a'],
      ['2025-07-10', 'Low Bar Squat', 200, 3, '', '', '', 's1'],
      ['2025-07-20', 'Training maxes', 240, 150, 285, '', 'tm', 'tm-b'],
    ];
    const { sets, tms } = parseSheetMatrix(m);
    expect(sets.map((s) => s.name)).toEqual(['Low Bar Squat']); // tm rows excluded
    expect(tms).toEqual({ squat: 240, bench: 150, dead: 285 }); // last wins
  });

  it('returns null tms when there are no tm rows', () => {
    const m: unknown[][] = [['2025-01-10', 'Deadlift', 200, 5, 8, '', '', 'b2']];
    expect(parseSheetMatrix(m).tms).toBeNull();
  });

  it('ignores malformed rows and empty input', () => {
    expect(parseSheetMatrix([]).sets).toHaveLength(0);
    const m: unknown[][] = [
      ['not-a-date', 'Squat', 100, 5, '', '', '', 'bad'],
      ['2025-01-03', '', 100, 5, '', '', '', 'noname'],
      ['2025-01-03', 'Squat', 0, 5, '', '', '', 'zero'],
    ];
    expect(parseSheetMatrix(m).sets).toHaveLength(0);
  });
});
