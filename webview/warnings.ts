import {
  KNOWN_DIVERGENCES,
  type KnownDivergence,
  type NodeId,
  type SourceRef,
  type Warning,
  type WarningKind,
  type WarningReason,
  type WarningSubject,
} from 'uxml-preview';
import type { AssetReference, HostDiagnostic } from '../src/preview/protocol';

export interface WarningLine {
  readonly source: 'parse' | 'render' | 'host';
  readonly kind: WarningKind;
  readonly message: string;
  readonly sourceDocument?: string | null;
  readonly at?: SourceRef;
  readonly node?: NodeId;
  readonly reason?: WarningReason;
  readonly subject?: WarningSubject;
  /** Exact failed path supplied by the core subject, or by a host diagnostic. */
  readonly path?: string;
  readonly form?: AssetReference['form'];
}

type ActionableLine = WarningLine | HostDiagnostic;

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
  readonly B: Array<WarningLine | HostDiagnostic>;
  readonly C: Array<WarningLine | DivergenceLine>;
  readonly D: WarningLine[];
  readonly layoutMayDiffer: boolean;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled warning kind: ${String(value)}`);
}

export function diagnosticGroup(kind: WarningKind): 'A' | 'B' | 'C' {
  switch (kind) {
    case 'import-unresolved':
    case 'asset-unresolved':
    case 'malformed':
    case 'template-src-unresolved':
    case 'template-not-declared':
    case 'template-cycle':
    case 'template-depth-exceeded':
    case 'override-target-missing':
    case 'override-style-ignored':
    case 'duplicate-name-in-tree':
      return 'A';
    case 'unsupported-control':
    case 'unsupported-property':
    case 'unsupported-selector':
    case 'unsupported-unit':
    case 'package-path-not-searched':
    case 'template-slot-unsupported':
      return 'B';
    case 'version-dependent':
      return 'C';
    default:
      return assertNever(kind);
  }
}

/**
 * Purpose: groups diagnostics by reason first, then by the existing kind rules.
 * Ensures: preserves warning order and always appends every known divergence.
 */
export function diagnosticGroups(
  lines: readonly WarningLine[],
  hostDiagnostics: readonly HostDiagnostic[] = [],
  divergences: readonly KnownDivergence[] = KNOWN_DIVERGENCES,
): DiagnosticGroups {
  const groups: DiagnosticGroups = {
    A: [], B: [], C: [], D: [],
    layoutMayDiffer: lines.some(({ reason, subject }) => (
      reason === 'not-rendered' && subject?.kind === 'property' && subject.affectsLayout === true
    )),
  };
  const unsupportedResources = new Set(hostDiagnostics
    .filter(({ kind, path }) => kind === 'resource-unsupported' && path !== undefined)
    .map(({ path }) => path!));
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
    // core: reasons are an open set; unknown or absent reasons keep kind-based grouping.
    switch (line.reason) {
      case 'not-uss':
      case 'invalid-value':
        addActionable(line);
        continue;
      case 'matches-unity':
        groups.D.push(line);
        continue;
      default:
        break;
    }
    if (line.kind === 'asset-unresolved' && line.form !== 'url' && line.path !== undefined && unsupportedResources.has(line.path)) {
      groups.B.push(line);
      continue;
    }
    const group = diagnosticGroup(line.kind);
    if (group === 'A') addActionable(line);
    else groups[group].push(line);
  }
  for (const diagnostic of hostDiagnostics) {
    if (diagnostic.kind === 'resource-unsupported') {
      groups.B.push(diagnostic);
      continue;
    }
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
  ...(warning.sourceDocument === undefined ? {} : { sourceDocument: warning.sourceDocument }),
  ...(warning.at === undefined ? {} : { at: warning.at }),
  ...(warning.node === undefined ? {} : { node: warning.node }),
  ...(warning.reason === undefined ? {} : { reason: warning.reason }),
  ...(warning.subject === undefined ? {} : { subject: warning.subject }),
  ...(warning.kind === 'import-unresolved' && warning.subject?.kind === 'import'
    ? { path: warning.subject.url }
    : {}),
  ...(warning.kind === 'asset-unresolved' && warning.subject?.kind === 'asset'
    ? { path: warning.subject.path, form: warning.subject.form }
    : {}),
});

/**
 * Purpose: flatten all warning sources without interpreting core diagnostics.
 * Ensures: preserves source order, duplicates, kinds, messages, and references.
 */
export function warningLines(
  parseWarnings: readonly Warning[],
  renderWarnings: readonly Warning[],
  unresolvedImports: readonly string[],
  _unresolvedAssets: readonly AssetReference[] = [],
): WarningLine[] {
  return [
    ...parseWarnings.map((warning) => warningLine('parse', warning)),
    ...renderWarnings.map((warning) => warningLine('render', warning)),
    ...unresolvedImports.map((url) => ({
      source: 'host' as const,
      kind: 'import-unresolved' as const,
      message: `Unresolved dependency: ${url}. It is not watched; reopen the preview after the file is created.`,
      path: url,
    })),
  ];
}
