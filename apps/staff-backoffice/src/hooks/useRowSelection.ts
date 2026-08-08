import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  toSelectable, toggleId, toggleAll, pruneSelection, selectionState,
} from '../lib/rowSelection';

export function useRowSelection<T>(
  rows: T[],
  getId: (row: T) => string,
  isProtected: (row: T) => boolean = () => false,
) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectable = useMemo(
    () => toSelectable(rows, getId, isProtected),
    // getId / isProtected are inline arrows recreated every render; rows drives this
    [rows],
  );

  // Every refetch produces a fresh `rows` array, so `selectable` is a new object
  // reference on each load even when the content is identical. Keying the prune
  // effect on a primitive digest instead of the array stops it re-firing forever.
  const selectableKey = useMemo(
    () => selectable.map((r) => `${r.id}:${r.protected ? 1 : 0}`).join('|'),
    [selectable],
  );

  // The rendered set changes when the "show archived" filter flips or after a
  // refetch. Without this prune, a stale id could be swept into a bulk delete
  // even though its row is no longer on screen.
  useEffect(() => {
    setSelected((prev) => {
      const next = pruneSelection(prev, selectable);
      // Compare content, not size: a row can flip to protected without the count
      // changing, and that id must still be dropped.
      const unchanged = next.size === prev.size && [...prev].every((id) => next.has(id));
      return unchanged ? prev : next;
    });
    // selectable is intentionally read but not depended on; selectableKey is its digest
  }, [selectableKey]);

  const toggle = useCallback((id: string) => setSelected((prev) => toggleId(prev, id)), []);
  const toggleAllVisible = useCallback(
    () => setSelected((prev) => toggleAll(prev, selectable)),
    [selectable],
  );
  const clear = useCallback(() => setSelected(new Set()), []);
  const remove = useCallback((id: string) => setSelected((prev) => {
    if (!prev.has(id)) return prev;
    const next = new Set(prev);
    next.delete(id);
    return next;
  }), []);

  return {
    selected,
    selectedCount: selected.size,
    headerState: selectionState(selected, selectable),
    isSelected: (id: string) => selected.has(id),
    toggle,
    toggleAllVisible,
    clear,
    remove,
  };
}
