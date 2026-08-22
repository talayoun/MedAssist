import { describe, it, expect } from 'vitest';
import {
  toSelectable, selectableIds, toggleId, pruneSelection, toggleAll, selectionState,
  type SelectableRow,
} from '../src/lib/rowSelection';

const rows: SelectableRow[] = [
  { id: 'a', protected: false },
  { id: 'b', protected: false },
  { id: 'p', protected: true },
];

describe('toSelectable', () => {
  it('maps arbitrary rows through the id and protection accessors', () => {
    const src = [{ key: 'x', sys: true }, { key: 'y', sys: false }];
    expect(toSelectable(src, (r) => r.key, (r) => r.sys)).toEqual([
      { id: 'x', protected: true },
      { id: 'y', protected: false },
    ]);
  });
});

describe('selectableIds', () => {
  it('excludes protected rows', () => {
    expect(selectableIds(rows)).toEqual(['a', 'b']);
  });
});

describe('toggleId', () => {
  it('adds an absent id', () => {
    expect([...toggleId(new Set(), 'a')]).toEqual(['a']);
  });
  it('removes a present id', () => {
    expect([...toggleId(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });
  it('does not mutate the input set', () => {
    const src = new Set(['a']);
    toggleId(src, 'b');
    expect([...src]).toEqual(['a']);
  });
});

describe('pruneSelection', () => {
  it('drops ids that are no longer rendered', () => {
    expect([...pruneSelection(new Set(['a', 'gone']), rows)]).toEqual(['a']);
  });
  it('drops ids that became protected', () => {
    expect([...pruneSelection(new Set(['a', 'p']), rows)]).toEqual(['a']);
  });
  it('returns an empty set when nothing is rendered', () => {
    expect([...pruneSelection(new Set(['a']), [])]).toEqual([]);
  });
});

describe('toggleAll', () => {
  it('selects every selectable row when none are selected', () => {
    expect([...toggleAll(new Set(), rows)]).toEqual(['a', 'b']);
  });
  it('never selects a protected row', () => {
    expect([...toggleAll(new Set(), rows)]).not.toContain('p');
  });
  it('clears the selection when all selectable rows are already selected', () => {
    expect([...toggleAll(new Set(['a', 'b']), rows)]).toEqual([]);
  });
  it('completes a partial selection', () => {
    expect([...toggleAll(new Set(['a']), rows)]).toEqual(['a', 'b']);
  });
});

describe('selectionState', () => {
  it('reports none', () => { expect(selectionState(new Set(), rows)).toBe('none'); });
  it('reports some', () => { expect(selectionState(new Set(['a']), rows)).toBe('some'); });
  it('reports all when every selectable row is selected', () => {
    expect(selectionState(new Set(['a', 'b']), rows)).toBe('all');
  });
  it('reports none when there is nothing selectable', () => {
    expect(selectionState(new Set(), [{ id: 'p', protected: true }])).toBe('none');
  });
});
