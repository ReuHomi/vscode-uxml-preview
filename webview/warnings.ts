import {
  KNOWN_DIVERGENCES,
  type KnownDivergence,
  type NodeId,
  type SourceRef,
  type Warning,
  type WarningKind,
} from 'uxml-preview';

export interface WarningLine {
  readonly source: 'parse' | 'render' | 'host';
  readonly kind: WarningKind;
  readonly message: string;
  readonly at?: SourceRef;
  readonly node?: NodeId;
}

export interface DivergenceLine {
  readonly source: 'known-divergence';
  readonly kind: KnownDivergence['kind'];
  readonly message: string;
  readonly detail: string;
}

export interface DiagnosticGroups {
  readonly A: WarningLine[];
  readonly B: WarningLine[];
  readonly C: Array<WarningLine | DivergenceLine>;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled warning kind: ${String(value)}`);
}

export function diagnosticGroup(kind: WarningKind): keyof DiagnosticGroups {
  switch (kind) {
    case 'import-unresolved':
    case 'asset-unresolved':
    case 'malformed':
      return 'A';
    case 'unsupported-control':
    case 'unsupported-property':
    case 'unsupported-selector':
    case 'unsupported-unit':
      return 'B';
    case 'version-dependent':
      return 'C';
    default:
      return assertNever(kind);
  }
}

/**
 * Purpose: groups diagnostics by what the user can do, not by core kind.
 * Ensures: preserves warning order and always appends every known divergence.
 */
export function diagnosticGroups(
  lines: readonly WarningLine[],
  divergences: readonly KnownDivergence[] = KNOWN_DIVERGENCES,
): DiagnosticGroups {
  const groups: DiagnosticGroups = { A: [], B: [], C: [] };
  for (const line of lines) groups[diagnosticGroup(line.kind)].push(line);
  groups.C.push(...divergences.map(({ kind, summary, detail }) => ({
    source: 'known-divergence' as const,
    kind,
    message: summary,
    detail,
  })));
  return groups;
}

const warningLine = (source: WarningLine['source'], warning: Warning): WarningLine => ({
  source,
  kind: warning.kind,
  message: warning.message,
  ...(warning.at === undefined ? {} : { at: warning.at }),
  ...(warning.node === undefined ? {} : { node: warning.node }),
});

/**
 * Purpose: flatten all warning sources without interpreting core diagnostics.
 * Ensures: preserves source order, duplicates, kinds, messages, and references.
 */
export function warningLines(
  parseWarnings: readonly Warning[],
  renderWarnings: readonly Warning[],
  unresolvedImports: readonly string[],
): WarningLine[] {
  return [
    ...parseWarnings.map((warning) => warningLine('parse', warning)),
    ...renderWarnings.map((warning) => warningLine('render', warning)),
    ...unresolvedImports.map((url) => ({
      source: 'host' as const,
      kind: 'import-unresolved' as const,
      message: `Unresolved stylesheet: ${url}. It is not watched; reopen the preview after the file is created.`,
    })),
  ];
}
