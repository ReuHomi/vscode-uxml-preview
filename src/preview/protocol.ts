/**
 * Purpose:  the only vocabulary the host and the webview share.
 * Ensures:  every render input crosses in one message, so the webview never
 *           needs to ask for anything mid-render.
 */

/** Host to webview. */
export interface RenderRequest {
  readonly type: 'render';
  readonly uxml: string;
  readonly uss: undefined;
  /** Every `(url, from)` lookup the core will ask for is already here. */
  readonly imports: readonly ResolvedImport[];
  /** Stylesheet URLs the host could not read. Kept separate from core warnings. */
  readonly unresolvedImports: readonly string[];
  /** Current setting value, included so actionable diagnostics can explain resolution. */
  readonly projectRoot: string;
  /** Host facts discovered while resolving assets. */
  readonly assetDiagnostics: readonly AssetDiagnostic[];
  /** Host facts discovered while resolving imports; shown in the fixable group. */
  readonly importDiagnostics: readonly ImportDiagnostic[];
  /** `(path, form)` to a webview URI resolved after the discovery render. */
  readonly assets: Record<string, string>;
  /** False on discovery render, true after the one permitted asset round trip. */
  readonly assetsResolved: boolean;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly fitToPanel: boolean;
  /**
   * Pseudo-classes drawn as active on every element, e.g. `['hover']`.
   * Empty until Step 7 adds the toggles.
   */
  readonly activeStates: readonly string[];
  /**
   * Pseudo-class states keyed by USS selector. The key format is settled; only
   * the selector input UX remains undecided. Always `{}` in this version.
   *
   * Required, not optional, on purpose: the caller has to write the empty
   * object, so anyone reading this asks why it is empty. See AGENTS.md,
   * ponytail exception 1. Do not make this optional and do not delete it.
   */
  readonly states: Record<string, readonly string[]>;
}

export interface ImportReference {
  readonly url: string;
  readonly from: string | null;
}

export interface ResolvedImport extends ImportReference {
  readonly text: string;
}

export function importKey(url: string, from: string | null): string {
  return JSON.stringify([url, from]);
}

export type AssetForm = 'url' | 'resource';

export interface AssetReference {
  readonly path: string;
  readonly form: AssetForm;
}

export function assetKey(path: string, form: AssetForm): string {
  return JSON.stringify([path, form]);
}

export interface AssetDiagnostic {
  readonly source: 'host';
  readonly kind: 'guid-index' | 'guid-index-skipped' | 'asset-path-stale' | 'guid-unresolved' | 'project-root-suggested' | 'package-cache-skipped' | 'resource-ambiguous' | 'resource-unresolved' | 'resource-unsupported';
  readonly message: string;
  /** Failed path this explains. No path means panel-wide host information. */
  readonly path?: string;
}

export interface ImportDiagnostic {
  readonly source: 'host';
  readonly kind: 'import-base-ambiguous';
  readonly message: string;
  /** Parent URL whose disk path could not be chosen safely. */
  readonly path: string;
}

export type HostDiagnostic = AssetDiagnostic | ImportDiagnostic;

/** Host to webview: a refresh failed before a render request could be built. */
export interface RenderFailure {
  readonly type: 'render-error';
  readonly message: string;
}

/** Webview to host. */
export interface ReadyNotice {
  readonly type: 'ready';
}

/** Webview to host: asset references the render asked for and did not have. */
export interface AssetMisses {
  readonly type: 'asset-misses';
  readonly references: readonly AssetReference[];
}

export interface CanvasSettings {
  readonly type: 'canvas-settings';
  readonly canvas: { readonly width: number; readonly height: number };
  readonly fitToPanel: boolean;
}

export interface ActiveStates {
  readonly type: 'active-states';
  readonly activeStates: readonly string[];
}

export type HostMessage = RenderRequest | RenderFailure;
export type WebviewMessage = ReadyNotice | AssetMisses | CanvasSettings | ActiveStates;
