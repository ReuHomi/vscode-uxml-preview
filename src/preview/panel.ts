/**
 * Purpose:  own the webview's lifetime and feed it finished render inputs.
 * Ensures:  every message sent is complete — the webview never asks for a file.
 *
 * STEP 2 owns this file. What is here is the shape, not the implementation.
 */
import * as vscode from 'vscode';
import { collectImports } from './imports';
import { contentSecurityPolicy, nonce } from './csp';
import type { RenderRequest } from './protocol';

export class PreviewPanel {
  static readonly viewType = 'uxmlPreview.panel';

  static open(
    _context: vscode.ExtensionContext,
    _uri: vscode.Uri,
    _column: vscode.ViewColumn,
  ): void {
    throw new Error('Step 2: create the panel, wire onDidReceiveMessage, render once.');
  }
}

/**
 * Assembles one render request.
 *
 * Note the asymmetry between the two hooks, which is easy to miss: import URLs
 * are discovered by `parse()`, which the host can run itself because it needs
 * no DOM. Asset paths are only reached during painting, inside the webview.
 * They therefore cannot be prefetched the same way — Step 6 decides how, and
 * until then `assets` stays empty and unresolved paths surface as warnings.
 */
export async function buildRenderRequest(
  uxml: string,
  uss: string | undefined,
  read: Parameters<typeof collectImports>[2],
  canvas: { width: number; height: number },
): Promise<RenderRequest> {
  const imports = await collectImports(uxml, uss, read);
  return {
    type: 'render',
    uxml,
    uss,
    imports: Object.fromEntries(imports.resolved),
    assets: {},
    canvas,
    // Empty on purpose, and required by the type so this line has to be written.
    // See AGENTS.md, ponytail exception 1.
    states: {},
  };
}

export { contentSecurityPolicy, nonce };
