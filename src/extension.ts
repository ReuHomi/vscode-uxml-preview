import * as vscode from 'vscode';
import { PreviewPanel } from './preview/panel';

/**
 * Purpose:      register the two commands and nothing else.
 * Deps/Effects: `context.subscriptions` owns both command registrations and
 *               disposes them when the extension deactivates.
 * Ensures:      no rendering, no parsing, no style logic lives in the host.
 */
export function activate(context: vscode.ExtensionContext): void {
  const open = (column: vscode.ViewColumn) => (resource?: vscode.Uri) => {
    const doc = vscode.window.activeTextEditor?.document;
    const uri = resource ?? doc?.uri;
    const fileName = resource?.fsPath ?? doc?.fileName;
    if (fileName?.endsWith('.uss')) {
      void vscode.window.showInformationMessage(
        'A USS file cannot be rendered on its own. In Unity UI Toolkit, a stylesheet only takes effect when attached to a document. Open a .uxml file that references this stylesheet with <Style src>.',
      );
      return;
    }
    if (uri === undefined || fileName === undefined || !fileName.endsWith('.uxml')) {
      void vscode.window.showInformationMessage('Open a .uxml file first.');
      return;
    }
    PreviewPanel.open(context, uri, column);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('uxmlPreview.showPreview', open(vscode.ViewColumn.Active)),
    vscode.commands.registerCommand('uxmlPreview.showPreviewToSide', open(vscode.ViewColumn.Beside)),
  );
}

export function deactivate(): void {}
