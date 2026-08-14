/**
 * These expectations are written before the loop is trusted, not after.
 * If one fails, the loop is wrong — do not edit the numbers here.
 */
import { describe, expect, it } from 'vitest';
import { collectImports, watchTargets } from '../src/preview/imports';

const UXML = (src: string) =>
  `<ui:UXML xmlns:ui="UnityEngine.UIElements"><Style src="${src}" /><ui:VisualElement /></ui:UXML>`;

const TWO_PARENTS = `<ui:UXML xmlns:ui="UnityEngine.UIElements">
  <Style src="a/main.uss" />
  <Style src="b/other.uss" />
  <ui:VisualElement />
</ui:UXML>`;

const parentSources = new Map([
  [JSON.stringify(['a/main.uss', null]), { text: '@import url("theme.uss");', path: 'a/main.uss' }],
  [JSON.stringify(['b/other.uss', null]), { text: '@import url("theme.uss");', path: 'b/other.uss' }],
  [JSON.stringify(['theme.uss', 'a/main.uss']), { text: '.a { width: 80px; }', path: 'a/theme.uss' }],
  [JSON.stringify(['theme.uss', 'b/other.uss']), { text: '.b { width: 160px; }', path: 'b/theme.uss' }],
]);

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
    expect([...r.resolved.values()].map(({ url }) => url).sort())
      .toEqual(['b.uss', 'project://database/Assets/a.uss']);
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

  it('reads the same relative URL once for each parent', async () => {
    const calls: Array<readonly [string, string | null]> = [];
    await collectImports(TWO_PARENTS, undefined, async (url, from) => {
      calls.push([url, from]);
      return parentSources.get(JSON.stringify([url, from])) ?? null;
    });

    expect(calls.filter(([url]) => url === 'theme.uss')).toHaveLength(2);
  });

  it('passes each immediate parent URL to the reader', async () => {
    const calls: Array<readonly [string, string | null]> = [];
    await collectImports(TWO_PARENTS, undefined, async (url, from) => {
      calls.push([url, from]);
      return parentSources.get(JSON.stringify([url, from])) ?? null;
    });

    expect(calls.filter(([url]) => url === 'theme.uss').map(([, from]) => from).sort())
      .toEqual(['a/main.uss', 'b/other.uss']);
  });

  it('keeps the two results for the same URL separate', async () => {
    const result = await collectImports(
      TWO_PARENTS,
      undefined,
      async (url, from) => parentSources.get(JSON.stringify([url, from])) ?? null,
    );

    expect([...result.resolved.values()].filter(({ url }) => url === 'theme.uss'))
      .toEqual([
        { url: 'theme.uss', from: 'a/main.uss', text: '.a { width: 80px; }' },
        { url: 'theme.uss', from: 'b/other.uss', text: '.b { width: 160px; }' },
      ]);
  });

  it('reads a repeated (url, from) pair only once', async () => {
    let themeReads = 0;
    await collectImports(UXML('parent.uss'), undefined, async (url, from) => {
      if (url === 'parent.uss') {
        return { text: '@import url("theme.uss"); @import url("theme.uss");', path: 'parent.uss' };
      }
      themeReads += 1;
      return { text: '.x {}', path: `${from}-${url}` };
    });

    expect(themeReads).toBe(1);
  });

  it('reads a root-fixed import only once across different parents', async () => {
    let globalReads = 0;
    await collectImports(TWO_PARENTS, undefined, async (url) => {
      if (url === 'a/main.uss' || url === 'b/other.uss') {
        return { text: '@import url("/Assets/theme.uss");', path: url };
      }
      globalReads += 1;
      return { text: '.x {}', path: 'Assets/theme.uss' };
    });

    expect(globalReads).toBe(1);
  });

  it('stops following imports at the round cap', async () => {
    const result = await collectImports(UXML('0.uss'), undefined, async (url) => {
      const index = Number.parseInt(url, 10);
      return { text: `@import url("${index + 1}.uss");`, path: url };
    });

    expect(result.rounds).toBe(16);
    expect(result.resolved.size).toBe(16);
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

  it('does not watch the same disk path twice', () => {
    expect(watchTargets('screen.uxml', ['shared.uss', 'shared.uss']))
      .toEqual(['screen.uxml', 'shared.uss']);
  });
});
