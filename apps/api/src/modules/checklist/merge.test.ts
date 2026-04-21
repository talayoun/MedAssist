import { describe, it, expect } from 'vitest';
import { mergeChecklistItems, ChecklistTemplateItem, ChecklistCustomItem } from './merge';

const t = (id: string, text = 'x', opts: Partial<ChecklistTemplateItem> = {}): ChecklistTemplateItem => ({
  id,
  text,
  category: 'other',
  time_sensitive: false,
  ...opts,
});
const c = (id: string, text = 'custom', opts: Partial<ChecklistCustomItem> = {}): ChecklistCustomItem => ({
  id,
  text,
  category: 'other',
  time_sensitive: false,
  ...opts,
});

describe('mergeChecklistItems', () => {
  it('returns template items unchanged when no overrides', () => {
    const r = mergeChecklistItems({
      templateItems: [t('a'), t('b')],
      customItems: [],
      suppressedTemplateItemIds: [],
      completedItemIds: [],
      hoursUntilVisit: null,
    });
    expect(r.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(r.items.every((i) => i.source === 'template')).toBe(true);
    expect(r.all_complete).toBe(false);
  });

  it('hides suppressed template items', () => {
    const r = mergeChecklistItems({
      templateItems: [t('a'), t('b'), t('c')],
      customItems: [],
      suppressedTemplateItemIds: ['b'],
      completedItemIds: [],
      hoursUntilVisit: null,
    });
    expect(r.items.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('appends custom items after template items', () => {
    const r = mergeChecklistItems({
      templateItems: [t('a')],
      customItems: [c('x'), c('y')],
      suppressedTemplateItemIds: [],
      completedItemIds: [],
      hoursUntilVisit: null,
    });
    expect(r.items.map((i) => i.id)).toEqual(['a', 'x', 'y']);
    expect(r.items[0].source).toBe('template');
    expect(r.items[1].source).toBe('custom');
    expect(r.items[2].source).toBe('custom');
  });

  it('applies completed flag to both template and custom items', () => {
    const r = mergeChecklistItems({
      templateItems: [t('a')],
      customItems: [c('x')],
      suppressedTemplateItemIds: [],
      completedItemIds: ['a', 'x'],
      hoursUntilVisit: null,
    });
    expect(r.items.every((i) => i.completed)).toBe(true);
    expect(r.all_complete).toBe(true);
  });

  it('all_complete is false when any item is unchecked', () => {
    const r = mergeChecklistItems({
      templateItems: [t('a'), t('b')],
      customItems: [c('x')],
      suppressedTemplateItemIds: [],
      completedItemIds: ['a', 'x'],
      hoursUntilVisit: null,
    });
    expect(r.all_complete).toBe(false);
  });

  it('all_complete ignores suppressed items', () => {
    const r = mergeChecklistItems({
      templateItems: [t('a'), t('b')],
      customItems: [],
      suppressedTemplateItemIds: ['b'],
      completedItemIds: ['a'],
      hoursUntilVisit: null,
    });
    expect(r.all_complete).toBe(true);
  });

  it('all_complete is false when item list is empty', () => {
    const r = mergeChecklistItems({
      templateItems: [],
      customItems: [],
      suppressedTemplateItemIds: [],
      completedItemIds: [],
      hoursUntilVisit: null,
    });
    expect(r.all_complete).toBe(false);
  });

  it('time_sensitive is true only within 24h window', () => {
    const outside = mergeChecklistItems({
      templateItems: [t('a', 'x', { time_sensitive: true })],
      customItems: [],
      suppressedTemplateItemIds: [],
      completedItemIds: [],
      hoursUntilVisit: 48,
    });
    expect(outside.items[0].time_sensitive).toBe(false);

    const inside = mergeChecklistItems({
      templateItems: [t('a', 'x', { time_sensitive: true })],
      customItems: [],
      suppressedTemplateItemIds: [],
      completedItemIds: [],
      hoursUntilVisit: 12,
    });
    expect(inside.items[0].time_sensitive).toBe(true);
  });

  it('time_sensitive stays false when item is not flagged, even within window', () => {
    const r = mergeChecklistItems({
      templateItems: [t('a', 'x', { time_sensitive: false })],
      customItems: [],
      suppressedTemplateItemIds: [],
      completedItemIds: [],
      hoursUntilVisit: 1,
    });
    expect(r.items[0].time_sensitive).toBe(false);
  });
});
