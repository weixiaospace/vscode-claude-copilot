import * as vscode from 'vscode';
import { ClaudeCliMissingError } from '../core/claude-cli';
import { t } from './l10n';

const INSTALL_URL = 'https://docs.claude.com/en/docs/claude-code/quickstart';

/**
 * Surface a Claude-CLI failure to the user.
 *
 * - If the error indicates the CLI binary is missing, show a warning with an
 *   "Install Claude CLI" button that opens the official setup docs.
 * - Otherwise show a regular error message with the underlying details.
 *
 * Returns `true` if the error was identified as a missing-CLI case (caller
 * may want to short-circuit further work in that branch).
 */
export async function notifyCliError(err: unknown): Promise<boolean> {
  if (err instanceof ClaudeCliMissingError) {
    const install = t('toast.installClaudeCli');
    const choice = await vscode.window.showWarningMessage(t('toast.cliMissing'), install);
    if (choice === install) {
      void vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL));
    }
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  void vscode.window.showErrorMessage(msg);
  return false;
}
