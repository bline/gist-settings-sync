import vscode from 'vscode'

import {isNodeError} from '@/nodeUtils'
import {SettingsManagerBase} from '@/settingsManager/base'
import {SettingsFile} from '@/settingsManager/types'
import fs from 'fs/promises'
import path from 'path'

export class TasksManager extends SettingsManagerBase {
  constructor(context: vscode.ExtensionContext) {
    super(context)
  }
  protected async fileNames(): Promise<Array<string>> {
    const folders = vscode.workspace.workspaceFolders

    if (!folders || folders.length === 0) {
      console.warn('No workspace folders found.')
      return []
    }

    // Use Promise.all to handle asynchronous operations and avoid race conditions
    const taskFiles = await Promise.all(
      folders.map(async (folder) => {
        const tasksFile = path.join(folder.uri.fsPath, '.vscode', 'tasks.json')
        try {
          await fs.access(tasksFile)
          return null // File exists, but we are ignoring it
        } catch (e) {
          if (isNodeError(e)) {
            if (e.code !== 'ENOENT') {
              console.warn(`Failed to access ${tasksFile}`, e)
              return null // Permission or other error, ignore this file
            }
          }
          // If file doesn't exist or some non-critical error, return the fallback task name
          return `workspace-${folder.name}-tasks.json`
        }
      }),
    )

    // Filter out nulls (files that exist or had non-ENOENT errors)
    return taskFiles.filter((task): task is string => task !== null)
  }
  public canHandle(file: SettingsFile): boolean {
    return file.fileName.endsWith('-tasks.json')
  }
}
