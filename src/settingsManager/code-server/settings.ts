import path from 'path';
import { getUserDataDir } from '@/config';
import { readFileIfExists, writeFileEnsureDir } from '@/fileUtils';
import { SettingsManagerBase } from '@/settingsManager/base';
import fs from 'fs'
import vscode from 'vscode'

export class CodeServerSettings extends SettingsManagerBase {
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
/**
 * Extracts the settings data from the settings.json file.
 * @returns A Promise that resolves to the settings content as a string, or null if the file doesn't exist.
 */
export async function extract(): Promise<string | null> {
  const userDataDir: string = getUserDataDir();
  const settingsPath: string = path.join(userDataDir, 'settings.json');
  return await readFileIfExists(settingsPath);
}

/**
 * Stores the provided data into the settings.json file.
 * @param data The data to store.
 * @returns A Promise that resolves when the data is successfully stored.
 */
export async function store(data: unknown): Promise<void> {
  const userDataDir: string = getUserDataDir();
  const settingsPath: string = path.join(userDataDir, 'settings.json');
  await writeFileEnsureDir(settingsPath, JSON.stringify(data, null, 2));
}