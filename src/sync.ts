import vscode from 'vscode'

import {SyncConfig, getConfig} from '@/config'
import {GistFile, Meta, checkMeta, fetchGists, getGistFileContent, storeGists} from '@/gistApi'
import {FileHandler, SettingsFile, SettingsManagers} from '@/settingsManager/types'
import {handleError, resetStatusBarItem, setStatusBarItemSyncing} from '@/statusBar'

/**
 * Extracts files using the provided extractor and merges them into the given `files` object.
 * Throws a new error with a custom message if extraction fails.
 */
async function addFilesFrom(
  extractor: () => Promise<Array<{fileName: string; content: string | null}>>,
  settingsName: string,
  files: Record<string, Pick<GistFile, 'content'>>,
): Promise<void> {
  try {
    const items = await extractor()
    items
      .filter((item): item is {fileName: string; content: string} => item.content !== null)
      .forEach(({fileName, content}) => {
        files[fileName] = {content}
      })
  } catch (error) {
    throw new Error(`Failed to extract ${settingsName}`, {cause: error})
  }
}

/**
 * The Sync Up command: Reads the selected configuration files, builds a payload,
 * and sends it to the specified GitHub Gist.
 */
export async function syncUp(
  context: vscode.ExtensionContext,
  settingsManager: SettingsManagers,
): Promise<void> {
  setStatusBarItemSyncing('syncUp')

  try {
    const config: SyncConfig = getConfig()
    const files: Record<string, Pick<GistFile, 'content'>> = {}

    // Collect promises for each enabled extraction
    const tasks: Promise<void>[] = []

    if (config.includeSettings) {
      tasks.push(addFilesFrom(() => settingsManager.settings.extract(), 'settings', files))
    }
    if (config.includeKeybindings) {
      tasks.push(addFilesFrom(() => settingsManager.keybindings.extract(), 'keybindings', files))
    }
    if (config.includeSnippets) {
      tasks.push(addFilesFrom(() => settingsManager.snippets.extract(), 'snippets', files))
    }
    if (config.includeTasks) {
      tasks.push(addFilesFrom(() => settingsManager.tasks.extract(), 'tasks', files))
    }
    if (config.includeProfiles) {
      tasks.push(addFilesFrom(() => settingsManager.profiles.extract(), 'profiles', files))
    }
    if (config.includeExtensions) {
      tasks.push(addFilesFrom(() => settingsManager.extensions.extract(), 'extensions', files))
    }
    if (config.includeUIState) {
      // TODO Implement UI state extraction if needed.
      // Example:
      // tasks.push(addFilesFrom(() => extractUIState(), 'uiState', files));
    }

    // Run all extractions concurrently.
    // If no setting sync is enabled, this returns immediately
    await Promise.all(tasks)

    // Add meta information.
    files['meta.json'] = {
      content: JSON.stringify({
        appName: vscode.env.appName,
        appHost: vscode.env.appHost,
        vscodeVersion: vscode.version,
      } as Meta),
    }

    // If storeGists is asynchronous, await it.
    await storeGists(context, files)
    vscode.window.showInformationMessage('Sync Up completed successfully')
  } catch (error: unknown) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(`Sync Up failed: ${error.message}`)
    } else {
      handleError('syncUp', new Error(`Something went wrong: ${error}`))
    }
  } finally {
    resetStatusBarItem()
  }
}

/**
 * The Sync Down command: Retrieves configuration data from the GitHub Gist,
 * writes files to disk, updates the frontend UI state (on code–server), and installs missing extensions.
 */
export async function syncDown(
  context: vscode.ExtensionContext,
  settingsManager: SettingsManagers,
): Promise<void> {
  const config: SyncConfig = getConfig()
  setStatusBarItemSyncing('syncDown')

  const managers: FileHandler[] = []
  if (config.includeSettings) {
    managers.push(settingsManager.settings)
  }
  if (config.includeKeybindings) {
    managers.push(settingsManager.keybindings)
  }
  if (config.includeSnippets) {
    managers.push(settingsManager.snippets)
  }
  if (config.includeTasks) {
    managers.push(settingsManager.tasks)
  }
  if (config.includeProfiles) {
    managers.push(settingsManager.profiles)
  }
  if (config.includeExtensions) {
    managers.push(settingsManager.extensions)
  }
  if (config.includeUIState) {
    // TODO If you have a manager for UI state, push it here.
    // managers.push(settingsManager.uiState);
  }
  try {
    const files = await fetchGists(context)
    // Check metadata
    if (files['meta.json'] && !(await checkMeta(files['meta.json'], 'syncDownMetaCheckAction'))) {
      return
    }
    const managerToFiles: Map<FileHandler, SettingsFile[]> = new Map()

    for (const [fileName, {content, ...gist}] of Object.entries(files)) {
      if (fileName === 'meta.json') continue
      const file: SettingsFile = {fileName, content: await getGistFileContent({content, ...gist})}
      const matchingManagers = managers.filter((manager) => manager.canHandle(file))

      if (matchingManagers.length === 0) {
        console.warn(`No manager found for file: ${fileName}`)
        continue
      }
      if (matchingManagers.length > 1) {
        console.warn(`Multiple managers found for file: ${fileName}. Using the first one.`)
      }

      const manager = matchingManagers[0]
      if (!managerToFiles.has(manager)) {
        managerToFiles.set(manager, [])
      }
      managerToFiles.get(manager)!.push(file)
    }
    const tasks = Array.from(managerToFiles.entries()).map(([manager, files]) =>
      manager.store(files),
    )
    await Promise.all(tasks)
    vscode.window.showInformationMessage('Sync Down completed successfully')
  } catch (error: unknown) {
    if (error instanceof Error) {
      handleError('syncDown', error)
    } else {
      handleError('syncDown', new Error(`Something went wrong: ${error}`))
    }
  } finally {
    resetStatusBarItem()
  }
}
