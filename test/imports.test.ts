/**
 * These expectations are written before the loop is trusted, not after.
 * If one fails, the loop is wrong — do not edit the numbers here.
 */
import { describe, expect, it } from 'vitest';
import { expandTemplates, parse, TEMPLATE_DEPTH_LIMIT } from 'uxml-preview';
import { collectImports, watchTargets } from '../src/preview/imports';
import { importKey } from '../src/preview/protocol';

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

  it('prefetches nested template UXML and its local stylesheet', async () => {
    const entry = `<ui:UXML xmlns:ui="UnityEngine.UIElements">
      <ui:Template name="Outer" src="templates/outer.uxml" />
      <ui:Instance template="Outer" />
    </ui:UXML>`;
    const files = new Map<string, { text: string; path: string }>([
      [JSON.stringify(['templates/outer.uxml', null]), {
        text: `<ui:UXML xmlns:ui="UnityEngine.UIElements"><Style src="outer.uss" /><ui:Template name="Inner" src="inner.uxml" /><ui:Instance template="Inner" /></ui:UXML>`,
        path: 'templates/outer.uxml',
      }],
      [JSON.stringify(['outer.uss', 'templates/outer.uxml']), {
        text: '.outer { width: 10px; }',
        path: 'templates/outer.uss',
      }],
      [JSON.stringify(['inner.uxml', 'templates/outer.uxml']), {
        text: `<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:VisualElement /></ui:UXML>`,
        path: 'templates/inner.uxml',
      }],
    ]);

    const result = await collectImports(
      entry,
      undefined,
      async (url, from) => files.get(JSON.stringify([url, from])) ?? null,
    );

    expect([...result.resolved.values()]).toEqual([
      { url: 'templates/outer.uxml', from: null, text: files.get(JSON.stringify(['templates/outer.uxml', null]))!.text },
      { url: 'outer.uss', from: 'templates/outer.uxml', text: '.outer { width: 10px; }' },
      { url: 'inner.uxml', from: 'templates/outer.uxml', text: files.get(JSON.stringify(['inner.uxml', 'templates/outer.uxml']))!.text },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it('stops following imports at the core template depth limit', async () => {
    const result = await collectImports(UXML('0.uss'), undefined, async (url) => {
      const index = Number.parseInt(url, 10);
      return { text: `@import url("${index + 1}.uss");`, path: url };
    });

    expect(result.rounds).toBe(TEMPLATE_DEPTH_LIMIT);
    expect(result.resolved.size).toBe(TEMPLATE_DEPTH_LIMIT);
  });

  it('terminates when two template documents point at each other', async () => {
    const entry = `<ui:UXML xmlns:ui="UnityEngine.UIElements">
      <ui:Template name="A" src="a.uxml" />
      <ui:Instance template="A" />
    </ui:UXML>`;
    const files = new Map([
      [JSON.stringify(['a.uxml', null]), {
        text: `<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Template name="B" src="b.uxml" /><ui:Instance template="B" /></ui:UXML>`,
        path: 'a.uxml',
      }],
      [JSON.stringify(['b.uxml', 'a.uxml']), {
        text: `<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Template name="A" src="a.uxml" /><ui:Instance template="A" /></ui:UXML>`,
        path: 'b.uxml',
      }],
      [JSON.stringify(['a.uxml', 'b.uxml']), {
        text: `<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Template name="B" src="b.uxml" /><ui:Instance template="B" /></ui:UXML>`,
        path: 'a.uxml',
      }],
    ]);
    const result = await collectImports(entry, undefined, async (url, from) => files.get(JSON.stringify([url, from])) ?? null);
    expect(result.rounds).toBeLessThan(TEMPLATE_DEPTH_LIMIT);
    expect(result.resolved.size).toBeGreaterThan(0);
  });

  // 0.3.1: the walk goes exactly as deep as the core expands (TEMPLATE_DEPTH_LIMIT),
  // so the host never cuts a chain the core would still follow. Written before the
  // implementation; if one fails, the walk is wrong — do not edit the expectations.
  const chain = async (url: string, from: string | null) => {
    const index = Number.parseInt(url, 10);
    if (Number.isNaN(index)) return null;
    const next = index + 1;
    return {
      text: `<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Template name="T${next}" src="${next}.uxml" /><ui:Instance template="T${next}" /></ui:UXML>`,
      path: `${from ?? 'entry'}->${url}`,
    };
  };
  const chainEntry = '<ui:UXML xmlns:ui="UnityEngine.UIElements"><ui:Template name="T0" src="0.uxml" /><ui:Instance template="T0" /></ui:UXML>';
  const expansionKinds = async () => {
    const result = await collectImports(chainEntry, undefined, chain);
    const document = parse(chainEntry, undefined, {
      resolveImport: (url, from) => result.resolved.get(importKey(url, from ?? null))?.text ?? null,
    });
    return expandTemplates(document).warnings.map(({ kind }) => kind);
  };

  it('prefetches a 20-deep unique template chain completely', async () => {
    const result = await collectImports(chainEntry, undefined, async (url, from) => (
      Number.parseInt(url, 10) >= 20 ? null : chain(url, from)
    ));
    expect(result.resolved.size).toBe(20);
    expect(result.unresolved).toEqual(['20.uxml']);
    expect(result.rounds).toBeLessThan(TEMPLATE_DEPTH_LIMIT);
  });

  it('leaves a chain deeper than the limit to the core depth warning, not to a missing file', async () => {
    const kinds = await expansionKinds();
    expect(kinds).toContain('template-depth-exceeded');
    expect(kinds).not.toContain('template-src-unresolved');
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
