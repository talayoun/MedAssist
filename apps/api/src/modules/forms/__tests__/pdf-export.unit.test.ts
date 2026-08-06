import { describe, it, expect } from 'vitest';
import { computeLayout, MAX_EXPORT_ITEMS } from '../pdf-export.service';

const makeItem = (label: string) => ({ label, patient_file_url: null as string | null, staff_file_url: null as string | null });

describe('computeLayout', () => {
  it('returns all items when under cap', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(`item-${i}`));
    const result = computeLayout(items);
    expect(result).toHaveLength(10);
  });

  it('returns empty array when no items', () => {
    const result = computeLayout([]);
    expect(result).toHaveLength(0);
  });

  it('returns items at exactly the cap', () => {
    const items = Array.from({ length: MAX_EXPORT_ITEMS }, (_, i) => makeItem(`item-${i}`));
    const result = computeLayout(items);
    expect(result).toHaveLength(MAX_EXPORT_ITEMS);
  });

  it('throws 422 when over cap', () => {
    const items = Array.from({ length: MAX_EXPORT_ITEMS + 1 }, (_, i) => makeItem(`item-${i}`));
    let caught: unknown;
    try { computeLayout(items); } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(422);
  });
});
