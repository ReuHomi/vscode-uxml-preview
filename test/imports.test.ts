/**
 * These expectations are written before the loop is trusted, not after.
 * If one fails, the loop is wrong — do not edit the numbers here.
 */
import { describe, expect, it } from 'vitest';
import { collectImports } from '../src/preview/imports';

const UXML = (src: string) =>
  `<ui:UXML xmlns:ui="UnityEngine.UIElements"><Style src="${src}" /><ui:VisualElement /></ui:UXML>`;

describe('collectImports', () => {
  it('resolves a sheet named by <Style src> in one round', async () => {
    const r = await collectImports(UXML('project://database/Assets/a.uss'), undefined, async () => '.x { width: 10px; }');
    expect(r.resolved.size).toBe(1);
    expect(r.unresolved).toEqual([]);
    expect(r.rounds).toBe(2); // one to discover, one to confirm nothing new
  });

  it('follows an @import that only appears after the first sheet is read', async () => {
    const sheets: Record<string, string> = {
      'project://database/Assets/a.uss': '@import url("b.uss"); .x { width: 10px; }',
      'b.uss': '.y { height: 5px; }',
    };
    const r = await collectImports(UXML('project://database/Assets/a.uss'), undefined, async (u) => sheets[u] ?? null);
    expect([...r.resolved.keys()].sort()).toEqual(['b.uss', 'project://database/Assets/a.uss']);
  });

  it('reports a URL no reader can turn into text, and asks only once', async () => {
    let calls = 0;
    const r = await collectImports(UXML('missing.uss'), undefined, async () => { calls += 1; return null; });
    expect(r.unresolved).toEqual(['missing.uss']);
    expect(calls).toBe(1);
  });

  it('hands the hook the raw URL, query string and all', async () => {
    const seen: string[] = [];
    await collectImports(UXML('project://database/Assets/a.uss?fileID=7&amp;guid=abc'), undefined, async (u) => { seen.push(u); return null; });
    expect(seen[0]).toContain('guid=abc');
    expect(seen[0]).not.toContain('&amp;'); // entities are decoded for the host
  });
});
