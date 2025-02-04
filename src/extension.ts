import * as vscode from "vscode";
import { syncUp, syncDown, scheduleCronSync } from "./syncManager";

export function activate(context: vscode.ExtensionContext): void {
  // Register the "sync up" command.
  const syncUpCommand = vscode.commands.registerCommand(
    "extension.syncUp",
    async () => {
      try {
        await syncUp(context);
        vscode.window.showInformationMessage("Settings sync up completed.");
      } catch (err: unknown) {
        vscode.window.showErrorMessage(
          `Sync Up failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );

  // Register the "sync down" command.
  const syncDownCommand = vscode.commands.registerCommand(
    "extension.syncDown",
    async () => {
      try {
        await syncDown(context);
        vscode.window.showInformationMessage("Settings sync down completed.");
      } catch (err: unknown) {
        vscode.window.showErrorMessage(
          `Sync Down failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );

  context.subscriptions.push(syncUpCommand, syncDownCommand);

  // Schedule automatic sync if a cron expression is provided.
  scheduleCronSync(context);
}

export function deactivate(): void {
  // Clean up if necessary.
}
