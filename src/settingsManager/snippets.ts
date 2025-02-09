import vscode from 'vscode'

import {getUserDataDir} from '@/config'
import {SettingsManagerBase} from '@/settingsManager/base'
import {SettingsFile} from '@/settingsManager/types'
import fs from 'fs/promises'
import path from 'path'

export class SnippetsManager extends SettingsManagerBase {
  constructor(context: vscode.ExtensionContext) {
    super(context)
  }
  protected async fileNames(): Promise<string[]> {
    const allSnippets: string[] = []
    const userDir = getUserDataDir()
    const userSnippetsDir = path.join(userDir, 'snippets')
    try {
      await fs.access(userSnippetsDir)
      const files = await fs.readdir(userSnippetsDir)
      files.forEach((file) => {
        if (file.endsWith('.code-snippets')) {
          allSnippets.push(file)
        }
      })
    } catch (e: unknown) {
      console.warn(
        `Failed to access ${userSnippetsDir}:`,
        typeof e === 'object' && e && 'message' in e ? e.message : e,
      )
    }
    const folders = vscode.workspace.workspaceFolders
    if (folders) {
      await Promise.all(
        folders.map(async (folder) => {
          const workspaceDir = path.join(folder.uri.fsPath, '.vscode')
          try {
            await fs.access(workspaceDir)
            const files = await fs.readdir(workspaceDir)
            files.map((file) => {
              if (file.endsWith('.code-snippets')) {
                allSnippets.push(`workspace-${folder.name}-${file}`)
              }
            })
          } catch (e: unknown) {
            console.warn(
              `Failed to access ${workspaceDir}:`,
              typeof e === 'object' && e && 'message' in e ? e.message : e,
            )
          }
        }),
      )
    }
    return allSnippets
  }
  public canHandle(file: SettingsFile): boolean {
    return file.fileName.endsWith('.code-snippets')
  }
  protected getUserFilePath(): string {
    return path.join(getUserDataDir(), 'snippets')
  }
}
