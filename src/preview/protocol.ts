/**
 * Purpose:  the only vocabulary the host and the webview share.
 * Ensures:  every render input crosses in one message, so the webview never
 *           needs to ask for anything mid-render.
 */

/** Host to webview. */
export interface RenderRequest {
  readonly type: 'render';
  readonly uxml: string;
  readonly uss: string | undefined;
  /** Stylesheet URL to text. Everything the core will ask for is already here. */
  readonly imports: Record<string, string>;
  /** Asset path to a URI the webview may load. See Step 6. */
  readonly assets: Record<string, string>;
  readonly canvas: { readonly width: number; readonly height: number };
  /**
   * Pseudo-class states keyed by USS selector. Always `{}` in this version.
   *
   * Required, not optional, on purpose: the caller has to write the empty
   * object, so anyone reading this asks why it is empty. See AGENTS.md,
   * ponytail exception 1. Do not make this optional and do not delete it.
   */
  readonly states: Record<string, readonly string[]>;
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

export type HostMessage = RenderRequest;
export type WebviewMessage = ReadyNotice | AssetMisses;
