/**
 * Pure selection-state helpers for admin tables.
 *
 * These tables have no pagination: the rendered set is the full list minus the
 * "show archived" filter. So "select all" means all currently rendered rows, and
 * the selection must be pruned whenever that rendered set changes, or a hidden
 * row could be swept into a bulk delete.
 */

export interface SelectableRow {
  id: string;
  protected: boolean;
}

export function toSelectable<T>(
  rows: T[],
  getId: (row: T) => string,
  isProtected: (row: T) => boolean,
): SelectableRow[] {
  return rows.map((row) => ({ id: getId(row), protected: isProtected(row) }));
}

export function selectableIds(rows: SelectableRow[]): string[] {
  return rows.filter((r) => !r.protected).map((r) => r.id);
}

export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function pruneSelection(selected: ReadonlySet<string>, rows: SelectableRow[]): Set<string> {
  const allowed = new Set(selectableIds(rows));
  return new Set([...selected].filter((id) => allowed.has(id)));
}

export function toggleAll(selected: ReadonlySet<string>, rows: SelectableRow[]): Set<string> {
  const ids = selectableIds(rows);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  return allSelected ? new Set() : new Set(ids);
}

export function selectionState(
  selected: ReadonlySet<string>,
  rows: SelectableRow[],
): 'none' | 'some' | 'all' {
  const ids = selectableIds(rows);
  const hits = ids.filter((id) => selected.has(id)).length;
  if (hits === 0) return 'none';
  return hits === ids.length ? 'all' : 'some';
}
