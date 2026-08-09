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

    expect(groups.A.map(({ message }) => message)).toEqual(['A first', 'A second']);
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

  it('rejects warning kinds outside the core union at type-check time', () => {
    if (false) {
      // @ts-expect-error A new core kind must be handled in the exhaustive switch first.
      diagnosticGroup('future-warning-kind');
    }
  });
});
