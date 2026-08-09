import { describe, expect, it } from 'vitest';
import { KNOWN_DIVERGENCES, type WarningKind } from 'uxml-preview';
import {
  diagnosticGroup,
  diagnosticGroups,
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
  it('classifies all eight warning kinds by user action', () => {
    expect(diagnosticGroup('import-unresolved')).toBe('A');
    expect(diagnosticGroup('asset-unresolved')).toBe('A');
    expect(diagnosticGroup('malformed')).toBe('A');
    expect(diagnosticGroup('unsupported-control')).toBe('B');
    expect(diagnosticGroup('unsupported-property')).toBe('B');
    expect(diagnosticGroup('unsupported-selector')).toBe('B');
    expect(diagnosticGroup('unsupported-unit')).toBe('B');
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
      unresolved('host', 'DesignTokens.uss', 'Unresolved stylesheet: DesignTokens.uss. It is not watched; reopen the preview after the file is created.'),
    ]);

    expect(groups.A).toHaveLength(1);
    expect(groups.A[0]!.lines.map(({ message }) => message)).toEqual([
      '@import "DesignTokens.uss" could not be resolved',
      'Unresolved stylesheet: DesignTokens.uss. It is not watched; reopen the preview after the file is created.',
    ]);
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

  it('rejects warning kinds outside the core union at type-check time', () => {
    if (false) {
      // @ts-expect-error A new core kind must be handled in the exhaustive switch first.
      diagnosticGroup('future-warning-kind');
    }
  });
});
