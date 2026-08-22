import { describe, it, expect } from 'vitest';
import {
  classifyOutcome, summarize, summaryMessage, runBulkDelete, type BulkResult,
} from '../src/lib/bulkDelete';

describe('classifyOutcome', () => {
  it('treats {archived:true} as archived', () => {
    expect(classifyOutcome({ deleted: false, archived: true })).toBe('archived');
  });
  it('treats {deleted:true, archived:false} as deleted', () => {
    expect(classifyOutcome({ deleted: true, archived: false })).toBe('deleted');
  });
  it('treats a 204 void response as deleted', () => {
    expect(classifyOutcome(undefined)).toBe('deleted');
  });
});

describe('summarize', () => {
  it('counts each outcome', () => {
    const results: BulkResult[] = [
      { id: '1', label: 'a', outcome: 'deleted' },
      { id: '2', label: 'b', outcome: 'archived' },
      { id: '3', label: 'c', outcome: 'failed', reason: 'in use' },
      { id: '4', label: 'd', outcome: 'deleted' },
    ];
    expect(summarize(results)).toEqual({ deleted: 2, archived: 1, failed: 1, results });
  });
});

describe('summaryMessage', () => {
  it('reports only the non-zero buckets, in Hebrew', () => {
    const msg = summaryMessage(summarize([
      { id: '1', label: 'a', outcome: 'deleted' },
      { id: '2', label: 'b', outcome: 'archived' },
    ]));
    expect(msg).toContain('נמחקו 1');
    expect(msg).toContain('הועברו לארכיון 1');
    expect(msg).not.toContain('נכשלו');
  });
});

describe('runBulkDelete', () => {
  it('returns one result per item and never throws', async () => {
    const summary = await runBulkDelete(
      [{ id: 'ok', label: 'A' }, { id: 'boom', label: 'B' }],
      async (id) => { if (id === 'boom') throw new Error('nope'); return { deleted: true, archived: false }; },
    );
    expect(summary.results).toHaveLength(2);
    expect(summary.deleted).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.results[1].reason).toBe('nope');
  });

  it('deletes sequentially, preserving input order', async () => {
    const seen: string[] = [];
    const summary = await runBulkDelete(
      [{ id: '1', label: 'A' }, { id: '2', label: 'B' }, { id: '3', label: 'C' }],
      async (id) => { seen.push(id); return undefined; },
    );
    expect(seen).toEqual(['1', '2', '3']);
    expect(summary.results.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('maps a rejected ApiError to failed and keeps the server message as the reason', async () => {
    // apiRequest throws ApiError on any non-ok response, so a 409 item_protected
    // never reaches classifyOutcome. It must surface as a failure with the
    // server's Hebrew message intact.
    class FakeApiError extends Error {
      constructor(public status: number, public code: string, message: string) { super(message); }
    }
    const summary = await runBulkDelete(
      [{ id: 'p', label: 'תבנית מערכת' }],
      async () => { throw new FakeApiError(409, 'item_protected', 'פריט מערכת מוגן. לא ניתן למחוק.'); },
    );
    expect(summary.failed).toBe(1);
    expect(summary.results[0].outcome).toBe('failed');
    expect(summary.results[0].reason).toBe('פריט מערכת מוגן. לא ניתן למחוק.');
  });

  it('records an archived outcome without counting it as deleted', async () => {
    const summary = await runBulkDelete(
      [{ id: '1', label: 'A' }],
      async () => ({ deleted: false, archived: true }),
    );
    expect(summary).toMatchObject({ deleted: 0, archived: 1, failed: 0 });
  });
});
