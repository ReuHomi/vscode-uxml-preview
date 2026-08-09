import {
  KNOWN_DIVERGENCES,
  type KnownDivergence,
  type NodeId,
  type SourceRef,
  type Warning,
  type WarningKind,
} from 'uxml-preview';
import type { AssetDiagnostic } from '../src/preview/protocol';

export interface WarningLine {
  readonly source: 'parse' | 'render' | 'host';
  readonly kind: WarningKind;
  readonly message: string;
  readonly at?: SourceRef;
  readonly node?: NodeId;
  /** Exact failed path supplied by a resolver hook, when one can be associated. */
  readonly path?: string;
}

type ActionableLine = WarningLine | AssetDiagnostic;

export interface DiagnosticItem {
  readonly path?: string;
  readonly lines: ActionableLine[];
  /** Number of core failure occurrences; host context does not increase it. */
  occurrences: number;
}

export interface DivergenceLine {
  readonly source: 'known-divergence';
  readonly kind: KnownDivergence['kind'];
  readonly message: string;
  readonly detail: string;
}

export interface DiagnosticGroups {
  readonly A: DiagnosticItem[];
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
  assetDiagnostics: readonly AssetDiagnostic[] = [],
  divergences: readonly KnownDivergence[] = KNOWN_DIVERGENCES,
): DiagnosticGroups {
  const groups: DiagnosticGroups = { A: [], B: [], C: [] };
  const addActionable = (line: ActionableLine): void => {
    const item = line.path === undefined
      ? undefined
      : groups.A.find(({ path }) => path === line.path);
    const target = item ?? { path: line.path, lines: [], occurrences: 0 };
    if (item === undefined) groups.A.push(target);
    if (!target.lines.some((existing) => (
      existing.source === line.source && existing.kind === line.kind && existing.message === line.message
    ))) target.lines.push(line);
    if (line.source !== 'host') target.occurrences += 1;
  };

  for (const line of lines) {
    const group = diagnosticGroup(line.kind);
    if (group === 'A') addActionable(line);
    else groups[group].push(line);
  }
  for (const diagnostic of assetDiagnostics) {
    if (diagnostic.kind === 'project-root-suggested' && diagnostic.path === undefined) {
      const target = groups.A.find(({ path }) => path !== undefined);
      if (target !== undefined) {
        target.lines.push(diagnostic);
        continue;
      }
    }
    addActionable(diagnostic);
  }
  for (const item of groups.A) item.occurrences = Math.max(1, item.occurrences);
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

function pathInWarning(warning: Warning, candidates: readonly string[]): string | undefined {
  return [...candidates]
    .sort((left, right) => right.length - left.length)
    .find((candidate) => warning.message.includes(candidate));
}

/**
 * Purpose: flatten all warning sources without interpreting core diagnostics.
 * Ensures: preserves source order, duplicates, kinds, messages, and references.
 */
export function warningLines(
  parseWarnings: readonly Warning[],
  renderWarnings: readonly Warning[],
  unresolvedImports: readonly string[],
  unresolvedAssets: readonly string[] = [],
): WarningLine[] {
  return [
    ...parseWarnings.map((warning) => ({
      ...warningLine('parse', warning),
      ...(warning.kind === 'import-unresolved'
        ? { path: pathInWarning(warning, unresolvedImports) }
        : {}),
    })),
    ...renderWarnings.map((warning) => ({
      ...warningLine('render', warning),
      ...(warning.kind === 'asset-unresolved'
        ? { path: pathInWarning(warning, unresolvedAssets) }
        : {}),
    })),
    ...unresolvedImports.map((url) => ({
      source: 'host' as const,
      kind: 'import-unresolved' as const,
      message: `Unresolved stylesheet: ${url}. It is not watched; reopen the preview after the file is created.`,
      path: url,
    })),
  ];
}
