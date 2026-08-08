/**
 * Sequential fan-out over the existing per-row DELETE endpoints.
 *
 * There is deliberately no bulk API route: the per-row handlers already encode
 * active-use checks, archive fallback, S3 cleanup and the manual appointment
 * cascade. Batches are single-table, so semantics are uniform inside one run,
 * but outcomes still vary per row (deleted / archived / rejected) and the caller
 * must report the split rather than a blanket success.
 */

export type BulkOutcome = 'deleted' | 'archived' | 'failed';

export interface BulkResult {
  id: string;
  label: string;
  outcome: BulkOutcome;
  reason?: string;
}

export interface BulkSummary {
  deleted: number;
  archived: number;
  failed: number;
  results: BulkResult[];
}

export function classifyOutcome(value: unknown): BulkOutcome {
  if (value && typeof value === 'object' && (value as { archived?: boolean }).archived === true) {
    return 'archived';
  }
  return 'deleted';
}

export function summarize(results: BulkResult[]): BulkSummary {
  return {
    deleted: results.filter((r) => r.outcome === 'deleted').length,
    archived: results.filter((r) => r.outcome === 'archived').length,
    failed: results.filter((r) => r.outcome === 'failed').length,
    results,
  };
}

export function summaryMessage(summary: BulkSummary): string {
  const parts: string[] = [];
  if (summary.deleted) parts.push(`נמחקו ${summary.deleted}`);
  if (summary.archived) parts.push(`הועברו לארכיון ${summary.archived}`);
  if (summary.failed) parts.push(`נכשלו ${summary.failed}`);
  return parts.length ? parts.join(', ') : 'לא בוצעו שינויים';
}

export async function runBulkDelete(
  items: { id: string; label: string }[],
  deleteOne: (id: string) => Promise<unknown>,
): Promise<BulkSummary> {
  const results: BulkResult[] = [];
  for (const item of items) {
    try {
      const value = await deleteOne(item.id);
      results.push({ id: item.id, label: item.label, outcome: classifyOutcome(value) });
    } catch (err) {
      results.push({
        id: item.id,
        label: item.label,
        outcome: 'failed',
        reason: err instanceof Error ? err.message : 'שגיאה לא ידועה',
      });
    }
  }
  return summarize(results);
}
