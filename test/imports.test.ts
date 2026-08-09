/**
 * These expectations are written before the loop is trusted, not after.
 * If one fails, the loop is wrong — do not edit the numbers here.
 */
import { describe, expect, it } from 'vitest';
import { collectImports, watchTargets } from '../src/preview/imports';

const UXML = (src: string) =>
  `<ui:UXML xmlns:ui="UnityEngine.UIElements"><Style src="${src}" /><ui:VisualElement /></ui:UXML>`;

describe('collectImports', () => {
  it('resolves a sheet named by <Style src> in one round', async () => {
    const r = await collectImports(UXML('project://database/Assets/a.uss'), undefined, async () => ({
      text: '.x { width: 10px; }',
      path: 'A.uss',
    }));
    expect(r.resolved.size).toBe(1);
    expect(r.paths).toEqual(['A.uss']);
    expect(r.unresolved).toEqual([]);
    expect(r.rounds).toBe(2); // one to discover, one to confirm nothing new
  });

  it('follows an @import that only appears after the first sheet is read', async () => {
    const sheets: Record<string, { text: string; path: string }> = {
      'project://database/Assets/a.uss': {
        text: '@import url("b.uss"); .x { width: 10px; }',
        path: 'A.uss',
      },
      'b.uss': { text: '.y { height: 5px; }', path: 'B.uss' },
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

describe('watchTargets', () => {
  it('follows the resolved import set from A to B', async () => {
    const a = await collectImports(UXML('a.uss'), undefined, async () => ({ text: '', path: 'A.uss' }));
    const b = await collectImports(UXML('b.uss'), undefined, async () => ({ text: '', path: 'B.uss' }));

    expect(watchTargets('screen.uxml', a.paths)).toEqual(['screen.uxml', 'A.uss']);
    expect(watchTargets('screen.uxml', b.paths)).toEqual(['screen.uxml', 'B.uss']);
  });

  it('does not watch an unresolved import', async () => {
    const imports = await collectImports(UXML('missing.uss'), undefined, async () => null);

    expect(watchTargets('screen.uxml', imports.paths)).toEqual(['screen.uxml']);
  });
});
