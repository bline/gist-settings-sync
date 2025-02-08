import path from 'path';
import { getUserDataDir } from '@/config';
import { readFileIfExists, writeFileEnsureDir } from '@/fileUtils';
import { SettingsManagerBase } from '@/settingsManager/base';

export class CodeServerSettings extends SettingsManagerBase {
  protected get fileNames(): string[] {
    return ['settings.json']
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