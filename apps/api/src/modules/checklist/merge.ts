export type ChecklistCategory = 'bring' | 'fast' | 'medication' | 'other';

export interface ChecklistTemplateItem {
  id: string;
  text: string;
  category: ChecklistCategory;
  time_sensitive: boolean;
}

export interface ChecklistCustomItem extends ChecklistTemplateItem {}

export interface ResolvedChecklistItem {
  id: string;
  text: string;
  category: string;
  time_sensitive: boolean;
  completed: boolean;
  source: 'template' | 'custom';
}

export interface MergeInput {
  templateItems: ChecklistTemplateItem[];
  customItems: ChecklistCustomItem[];
  suppressedTemplateItemIds: string[];
  completedItemIds: string[];
  hoursUntilVisit: number | null;
}

export interface MergeResult {
  items: ResolvedChecklistItem[];
  all_complete: boolean;
}

export function mergeChecklistItems(input: MergeInput): MergeResult {
  const suppressed = new Set(input.suppressedTemplateItemIds);
  const completed = new Set(input.completedItemIds);
  const withinTimeWindow =
    input.hoursUntilVisit !== null && input.hoursUntilVisit < 24;

  const fromTemplate: ResolvedChecklistItem[] = input.templateItems
    .filter((item) => !suppressed.has(item.id))
    .map((item) => ({
      id: item.id,
      text: item.text,
      category: item.category,
      time_sensitive: item.time_sensitive && withinTimeWindow,
      completed: completed.has(item.id),
      source: 'template',
    }));

  const fromCustom: ResolvedChecklistItem[] = input.customItems.map((item) => ({
    id: item.id,
    text: item.text,
    category: item.category,
    time_sensitive: item.time_sensitive && withinTimeWindow,
    completed: completed.has(item.id),
    source: 'custom',
  }));

  const items = [...fromTemplate, ...fromCustom];
  const all_complete = items.length > 0 && items.every((i) => i.completed);

  return { items, all_complete };
}
