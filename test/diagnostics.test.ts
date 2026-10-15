import { describe, expect, it } from 'vitest';
import { KNOWN_DIVERGENCES, type Warning, type WarningKind } from 'uxml-preview';
import {
  diagnosticGroup,
  diagnosticGroups,
  warningLines,
  type WarningLine,
} from '../webview/warnings';

const line = (kind: WarningKind, message: string = kind): WarningLine => ({
  source: 'render',
  kind,
  message,
});

const unresolved = (source: WarningLine['source'], path: string, message: string): WarningLine => ({
  source,
  kind: 'import-unresolved',
  message,
  path,
});

describe('diagnostic groups', () => {
  it('classifies all seventeen warning kinds by user action', () => {
    expect(diagnosticGroup('import-unresolved')).toBe('A');
    expect(diagnosticGroup('asset-unresolved')).toBe('A');
    expect(diagnosticGroup('malformed')).toBe('A');
    expect(diagnosticGroup('template-src-unresolved')).toBe('A');
    expect(diagnosticGroup('template-not-declared')).toBe('A');
    expect(diagnosticGroup('template-cycle')).toBe('A');
    expect(diagnosticGroup('template-depth-exceeded')).toBe('A');
    expect(diagnosticGroup('override-target-missing')).toBe('A');
    expect(diagnosticGroup('override-style-ignored')).toBe('A');
    expect(diagnosticGroup('duplicate-name-in-tree')).toBe('A');
    expect(diagnosticGroup('unsupported-control')).toBe('B');
    expect(diagnosticGroup('unsupported-property')).toBe('B');
    expect(diagnosticGroup('unsupported-selector')).toBe('B');
    expect(diagnosticGroup('unsupported-unit')).toBe('B');
    expect(diagnosticGroup('package-path-not-searched')).toBe('B');
    expect(diagnosticGroup('template-slot-unsupported')).toBe('B');
    expect(diagnosticGroup('version-dependent')).toBe('C');
  });

  it('preserves source order within groups and appends all known divergences to C', () => {
    const groups = diagnosticGroups([
      line('unsupported-property', 'B first'),
      line('malformed', 'A first'),
      line('unsupported-control', 'B second'),
      line('asset-unresolved', 'A second'),
      line('version-dependent', 'C warning'),
    ]);

    expect(groups.A.map(({ lines }) => lines[0]!.message)).toEqual(['A first', 'A second']);
    expect(groups.B.map(({ message }) => message)).toEqual(['B first', 'B second']);
    expect(groups.C.slice(0, 1).map(({ message }) => message)).toEqual(['C warning']);
    expect(groups.C.slice(1).map(({ kind }) => kind)).toEqual(KNOWN_DIVERGENCES.map(({ kind }) => kind));
  });

  it('keeps the three known divergences available when there are no warnings', () => {
    const groups = diagnosticGroups([]);

    expect(groups.A).toEqual([]);
    expect(groups.B).toEqual([]);
    expect(groups.C).toHaveLength(3);
  });

  it('counts one item when core and host describe the same unresolved path', () => {
    const groups = diagnosticGroups([
      unresolved('parse', 'DesignTokens.uss', '@import "DesignTokens.uss" could not be resolved'),
      unresolved('host', 'DesignTokens.uss', 'Unresolved dependency: DesignTokens.uss. It is not watched; reopen the preview after the file is created.'),
    ]);

    expect(groups.A).toHaveLength(1);
    expect(groups.A[0]!.lines.map(({ message }) => message)).toEqual([
      '@import "DesignTokens.uss" could not be resolved',
      'Unresolved dependency: DesignTokens.uss. It is not watched; reopen the preview after the file is created.',
    ]);
  });

  it('does not mislabel an unresolved template as a stylesheet', () => {
    expect(warningLines([], [], ['missing.uxml'])[0]!.message).toBe(
      'Unresolved dependency: missing.uxml. It is not watched; reopen the preview after the file is created.',
    );
  });

  it('counts two different unresolved paths as two items', () => {
    const groups = diagnosticGroups([
      unresolved('parse', 'one.uss', '@import "one.uss" could not be resolved'),
      unresolved('host', 'one.uss', 'one.uss is not watched'),
      unresolved('parse', 'two.uss', '@import "two.uss" could not be resolved'),
      unresolved('host', 'two.uss', 'two.uss is not watched'),
    ]);

    expect(groups.A).toHaveLength(2);
  });

  it('counts repeated use of one path once and records its occurrence count', () => {
    const warning = unresolved('render', 'same.png', 'background-image: "same.png" was not resolved');
    const groups = diagnosticGroups([warning, warning]);

    expect(groups.A).toHaveLength(1);
    expect(groups.A[0]!.occurrences).toBe(2);
  });

  it('keeps a project-root suggestion independent when there is no failure to attach it to', () => {
    const groups = diagnosticGroups([], [{
      source: 'host',
      kind: 'project-root-suggested',
      message: 'Set projectRoot.',
    }]);

    expect(groups.A).toHaveLength(1);
    expect(groups.A[0]!.lines[0]!.message).toBe('Set projectRoot.');
  });

  it('attaches a project-root suggestion when a failed path already has an item', () => {
    const groups = diagnosticGroups([
      unresolved('parse', 'missing.uss', '@import "missing.uss" could not be resolved'),
    ], [{
      source: 'host',
      kind: 'project-root-suggested',
      message: 'Set projectRoot.',
    }]);

    expect(groups.A).toHaveLength(1);
    expect(groups.A[0]!.lines.map(({ message }) => message)).toEqual([
      '@import "missing.uss" could not be resolved',
      'Set projectRoot.',
    ]);
  });

  it('places a host import-base ambiguity in the fixable group', () => {
    const groups = diagnosticGroups([], [{
      source: 'host',
      kind: 'import-base-ambiguous',
      message: 'theme.uss names two files',
      path: 'theme.uss',
    }]);

    expect(groups.A).toHaveLength(1);
    expect(groups.A[0]!.lines[0]).toEqual(expect.objectContaining({
      source: 'host',
      kind: 'import-base-ambiguous',
    }));
  });

  it('places a missing project resource and its core warning in A', () => {
    const path = 'missing';
    const groups = diagnosticGroups([{
      source: 'render',
      kind: 'asset-unresolved',
      message: `background-image resource('${path}') was not resolved`,
      path,
    }], [{
      source: 'host',
      kind: 'resource-unresolved',
      message: 'Searched 2 Resources folders and did not find missing.',
      path,
    }], []);

    expect(groups.A).toHaveLength(1);
    expect(groups.A[0]!.lines.map(({ kind }) => kind)).toEqual(['asset-unresolved', 'resource-unresolved']);
    expect(groups.C).toEqual([]);
  });

  it('places a found but unsupported resource in B', () => {
    const path = 'data';
    const groups = diagnosticGroups([{
      source: 'render',
      kind: 'asset-unresolved',
      message: 'background-image: data was not resolved',
      path,
    }], [{
      source: 'host',
      kind: 'resource-unsupported',
      message: 'Found data.asset but its format is unsupported.',
      path,
    }], []);

    expect(groups.A).toEqual([]);
    expect(groups.B.map(({ kind }) => kind)).toEqual(['asset-unresolved', 'resource-unsupported']);
    expect(groups.C).toEqual([]);
  });

  it('rejects warning kinds outside the core union at type-check time', () => {
    if (false) {
      // @ts-expect-error A new core kind must be handled in the exhaustive switch first.
      diagnosticGroup('future-warning-kind');
    }
  });
});

/**
 * 0.3.1 cases, written before the implementation (core 0.5.1 `reason`/`subject`).
 * If one fails, the implementation is wrong — do not edit the expectations here.
 */
describe('warningLines reads subject, not the message', () => {
  it('takes an unresolved import path from subject.url even when the message does not contain it', () => {
    const warning = {
      kind: 'import-unresolved',
      message: 'An imported stylesheet could not be resolved.',
      subject: { kind: 'import', url: 'Theme/tokens.uss', from: null },
    } satisfies Warning;

    expect(warningLines([warning], [], ['Theme/tokens.uss'])[0]).toEqual(expect.objectContaining({
      source: 'parse',
      path: 'Theme/tokens.uss',
    }));
  });

  it('takes an unresolved asset path and form from subject even when the message does not contain it', () => {
    const warning = {
      kind: 'asset-unresolved',
      message: 'An image was not resolved.',
      subject: { kind: 'asset', path: 'icons/close.png', form: 'url' },
    } satisfies Warning;

    expect(warningLines([], [warning], [], [{ path: 'icons/close.png', form: 'url' }])[0])
      .toEqual(expect.objectContaining({ source: 'render', path: 'icons/close.png', form: 'url' }));
  });

  it('does not fall back to searching the message when subject is absent', () => {
    const imported = { kind: 'import-unresolved', message: '@import "a.uss" could not be resolved' } satisfies Warning;
    const asset = { kind: 'asset-unresolved', message: 'background-image: "b.png" was not resolved' } satisfies Warning;

    const [parseLine, renderLine] = warningLines([imported], [asset], ['a.uss'], [{ path: 'b.png', form: 'url' }]);
    expect(parseLine!.path).toBeUndefined();
    expect(renderLine!.path).toBeUndefined();
  });

  it('carries reason and subject through to the line', () => {
    const subject = { kind: 'property', property: 'font-family', replacements: ['-unity-font-definition'] } as const;
    const warning = {
      kind: 'unsupported-property',
      message: 'font-family is not drawn.',
      reason: 'not-uss',
      subject,
    } satisfies Warning;

    expect(warningLines([], [warning], [])[0]).toEqual(expect.objectContaining({ reason: 'not-uss', subject }));
  });

  it('keeps a url() asset in A when a resource() of the same path is unsupported', () => {
    const path = 'data';
    const groups = diagnosticGroups([{
      source: 'render',
      kind: 'asset-unresolved',
      message: 'An image was not resolved.',
      path,
      form: 'url',
    }], [{
      source: 'host',
      kind: 'resource-unsupported',
      message: 'Found data.asset but its format is unsupported.',
      path,
    }], []);

    expect(groups.A.map(({ lines }) => lines[0]!.kind)).toEqual(['asset-unresolved']);
    expect(groups.B.map(({ kind }) => kind)).toEqual(['resource-unsupported']);
  });
});

describe('diagnostic groups by reason', () => {
  const withReason = (kind: WarningKind, reason: string, subject?: WarningLine['subject']): WarningLine => ({
    source: 'render',
    kind,
    message: `${kind} ${reason}`,
    reason: reason as WarningLine['reason'],
    ...(subject === undefined ? {} : { subject }),
  });

  it.each(['not-uss', 'invalid-value'])('moves a %s warning to the fixable group', (reason) => {
    const groups = diagnosticGroups([withReason('unsupported-property', reason)], [], []);

    expect(groups.A.map(({ lines }) => lines[0]!.reason)).toEqual([reason]);
    expect(groups.B).toEqual([]);
  });

  it('keeps a not-rendered warning in B', () => {
    const groups = diagnosticGroups([withReason('unsupported-property', 'not-rendered')], [], []);

    expect(groups.A).toEqual([]);
    expect(groups.B.map(({ kind }) => kind)).toEqual(['unsupported-property']);
  });

  it('puts a matches-unity warning in the notes group, out of A, B and C', () => {
    const groups = diagnosticGroups([withReason('version-dependent', 'matches-unity')], [], []);

    expect(groups.A).toEqual([]);
    expect(groups.B).toEqual([]);
    expect(groups.C).toEqual([]);
    expect(groups.D.map(({ kind }) => kind)).toEqual(['version-dependent']);
  });

  it('keeps a version-dependent reason where its kind puts it', () => {
    const groups = diagnosticGroups([withReason('version-dependent', 'version-dependent')], [], []);

    expect(groups.C.map(({ kind }) => kind)).toEqual(['version-dependent']);
  });

  it('sends an unknown reason to the kind-based group, not to A', () => {
    const groups = diagnosticGroups([withReason('unsupported-property', 'reason-from-a-future-core')], [], []);

    expect(groups.A).toEqual([]);
    expect(groups.B.map(({ kind }) => kind)).toEqual(['unsupported-property']);
  });

  it('flags layout risk only for a not-rendered warning whose subject affects layout', () => {
    const groups = diagnosticGroups([
      withReason('unsupported-property', 'not-rendered', { kind: 'property', property: 'transition', affectsLayout: false }),
      withReason('unsupported-property', 'not-rendered', { kind: 'property', property: 'letter-spacing', affectsLayout: true, applied: 'paint' }),
      withReason('unsupported-property', 'not-uss', { kind: 'property', property: 'gap', affectsLayout: true }),
    ], [], []);

    expect(groups.layoutMayDiffer).toBe(true);
    expect(diagnosticGroups([
      withReason('unsupported-property', 'not-rendered', { kind: 'property', property: 'transition', affectsLayout: false }),
    ], [], []).layoutMayDiffer).toBe(false);
    expect(diagnosticGroups([
      withReason('unsupported-property', 'not-uss', { kind: 'property', property: 'gap', affectsLayout: true }),
    ], [], []).layoutMayDiffer).toBe(false);
  });
});
