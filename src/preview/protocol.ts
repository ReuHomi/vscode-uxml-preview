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
  /** Stylesheet URL to text. Everything the core will ask for is already here. */
  readonly imports: Record<string, string>;
  /** Stylesheet URLs the host could not read. Kept separate from core warnings. */
  readonly unresolvedImports: readonly string[];
  /** Asset path to a URI the webview may load. See Step 6. */
  readonly assets: Record<string, string>;
  readonly canvas: { readonly width: number; readonly height: number };
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

/** Host to webview: a refresh failed before a render request could be built. */
export interface RenderFailure {
  readonly type: 'render-error';
  readonly message: string;
}

/** Webview to host. */
export interface ReadyNotice {
  readonly type: 'ready';
}

/** Webview to host: paths the render asked for and did not have. */
export interface AssetMisses {
  readonly type: 'asset-misses';
  readonly paths: readonly string[];
}

export type HostMessage = RenderRequest | RenderFailure;
export type WebviewMessage = ReadyNotice | AssetMisses;
