import { SettingsManagerBase } from "@/settingsManager/base";
import vscode from 'vscode'
import path from 'path'
import fs from 'fs'

export class VSCodeSettings extends SettingsManagerBase {
  protected get fileNames(): string[] {
    const files = []
    files.push('settings.json')
    vscode.workspace.workspaceFolders?.forEach((folder) => {
      const settingsPath = path.join(folder.uri.fsPath, '.vscode', 'settings.json')
      if (fs.existsSync(settingsPath)) {
        files.push(`workspace-${folder.name}-settings.json`)
      }
    })
    return files
  }
}