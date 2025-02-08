import vscode from 'vscode'

/**
 * Returns the list of installed (non–builtin) extension IDs.
 */
export function getInstalledExtensions(): string[] {
  return vscode.extensions.all
    .filter((ext) => !ext.packageJSON.isBuiltin)
    .map((ext) => ext.id)
}
