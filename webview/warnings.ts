import type { Warning } from 'uxml-preview';

export interface WarningLine {
  readonly source: 'parse' | 'render' | 'host';
  readonly kind: string;
  readonly message: string;
}

/**
 * Purpose: flatten all warning sources without interpreting core diagnostics.
 * Ensures: preserves source order, duplicates, kinds, and core messages.
 */
export function warningLines(
  parseWarnings: readonly Warning[],
  renderWarnings: readonly Warning[],
  unresolvedImports: readonly string[],
): WarningLine[] {
  return [
    ...parseWarnings.map(({ kind, message }) => ({ source: 'parse' as const, kind, message })),
    ...renderWarnings.map(({ kind, message }) => ({ source: 'render' as const, kind, message })),
    ...unresolvedImports.map((url) => ({
      source: 'host' as const,
      kind: 'unresolved-import',
      message: `Unresolved stylesheet: ${url}. It is not watched; reopen the preview after the file is created.`,
    })),
  ];
}
