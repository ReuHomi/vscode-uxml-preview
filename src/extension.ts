/**
 * Purpose:  register the two commands and nothing else.
 * Ensures:  no rendering, no parsing, no style logic lives in the host.
 */
import * as vscode from 'vscode';
import { PreviewPanel } from './preview/panel';

export function activate(context: vscode.ExtensionContext): void {
  const open = (column: vscode.ViewColumn) => () => {
    const doc = vscode.window.activeTextEditor?.document;
    if (doc === undefined || !doc.fileName.endsWith('.uxml')) {
      void vscode.window.showInformationMessage('Open a .uxml file first.');
      return;
    }
    PreviewPanel.open(context, doc.uri, column);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('uxmlPreview.showPreview', open(vscode.ViewColumn.Active)),
    vscode.commands.registerCommand('uxmlPreview.showPreviewToSide', open(vscode.ViewColumn.Beside)),
  );
}

export function deactivate(): void {}
