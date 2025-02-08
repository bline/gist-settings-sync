import { handleError, resetStatusBarItem, setStatusBarItemSyncing } from './statusBar'
import { getConfig, getUserDataDir, SyncConfig } from './config'
import { checkMeta, fetchGists, getGistFileContent, GistFile, Meta, storeGists } from './gistApi'
import path from 'path'
import { fs, readFileIfExists, readSnippets, writeFileEnsureDir } from './fileUtils'
import vscode, { getInstalledExtensions } from './vscode'
import { getFrontendPanel, initFrontendWebview } from './webview'
import { isCodeServer } from './globals'

/**
 * The Sync Up command: Reads the selected configuration files, builds a payload,
 * and sends it to the specified GitHub Gist.
 */
export async function syncUp(context: vscode.ExtensionContext): Promise<void> {
  setStatusBarItemSyncing('syncUp')
  try {
    const config: SyncConfig = getConfig()
    const userDataDir: string = getUserDataDir()
    const files: Record<string, Pick<GistFile, 'content'>> = {}

    if (config.includeSettings) {
      const settingsPath: string = path.join(userDataDir, 'settings.json')
      const settingsContent: string | null = await readFileIfExists(settingsPath)
      if (settingsContent !== null) {
        files['settings.json'] = { content: settingsContent }
      }
    }
    if (config.includeKeybindings) {
      const keybindingsPath: string = path.join(userDataDir, 'keybindings.json')
      const keybindingsContent: string | null = await readFileIfExists(keybindingsPath)
      if (keybindingsContent !== null) {
        files['keybindings.json'] = { content: keybindingsContent }
      }
    }
    if (config.includeSnippets) {
      const snippetsDir: string = path.join(userDataDir, 'snippets')
      const snippets: Record<string, string> = await readSnippets(snippetsDir)
      files['snippets.json'] = { content: JSON.stringify(snippets, null, 2) }
    }
    if (config.includeTasks) {
      const tasksPath: string = path.join(userDataDir, 'tasks.json')
      const tasksContent: string | null = await readFileIfExists(tasksPath)
      if (tasksContent !== null) {
        files['tasks.json'] = { content: tasksContent }
      }
    }
    if (config.includeUIState) {
      const uiStatePath: string = path.join(userDataDir, 'uiState.json')
      const uiStateContent: string | null = await readFileIfExists(uiStatePath)
      files['uiState.json'] = { content: uiStateContent || '{}' }
    }
    if (config.includeProfiles) {
      const profilesPath: string = path.join(userDataDir, 'profiles.json')
      const profilesContent: string | null = await readFileIfExists(profilesPath)
      if (profilesContent !== null) {
        files['profiles.json'] = { content: profilesContent }
      }
    }
    if (config.includeExtensions) {
      const installedExtensions: string[] = getInstalledExtensions()
      files['extensions.json'] = { content: JSON.stringify(installedExtensions, null, 2) }
    }
    files['meta.json'] = {
      content: JSON.stringify({
        appName: vscode.env.appName,
        appHost: vscode.env.appHost,
        vscodeVersion: vscode.version
      } as Meta)
    }

    storeGists(context, files)
    vscode.window.showInformationMessage('Sync Up completed successfully')
  } catch (error: unknown) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(`Sync Up failed: ${error.message}`)
    }
  } finally {
    resetStatusBarItem()
  }
}

/**
 * The Sync Down command: Retrieves configuration data from the GitHub Gist,
 * writes files to disk, updates the frontend UI state (on code–server), and installs missing extensions.
 */
export async function syncDown(context: vscode.ExtensionContext): Promise<void> {
  const config: SyncConfig = getConfig()
  const userDataDir = getUserDataDir()
  setStatusBarItemSyncing('syncDown')

  try {
    const files = await fetchGists(context)

    // Check metadata
    if (files['meta.json'] && !(await checkMeta(files['meta.json'], 'syncDownMetaCheckAction'))) {
      return
    }

    if (config.includeSettings && files['settings.json']) {
      const settingsPath: string = path.join(userDataDir, 'settings.json')
      await writeFileEnsureDir(settingsPath, await getGistFileContent(files['settings.json']))
    }
    if (config.includeKeybindings && files['keybindings.json']) {
      const keybindingsPath: string = path.join(userDataDir, 'keybindings.json')
      await writeFileEnsureDir(keybindingsPath, await getGistFileContent(files['keybindings.json']))
    }
    if (config.includeSnippets && files['snippets.json']) {
      const snippetsDir: string = path.join(userDataDir, 'snippets')
      const snippetsObj: Record<string, string> = JSON.parse(await getGistFileContent(files['snippets.json']))
      await fs.mkdir(snippetsDir, { recursive: true })
      for (const [fileName, content] of Object.entries(snippetsObj)) {
        const snippetPath: string = path.join(snippetsDir, fileName)
        await writeFileEnsureDir(snippetPath, content)
      }
    }
    if (config.includeTasks && files['tasks.json']) {
      const tasksPath: string = path.join(userDataDir, 'tasks.json')
      await writeFileEnsureDir(tasksPath, await getGistFileContent(files['tasks.json']))
    }
    if (config.includeUIState && files['uiState.json']) {
      const uiStatePath: string = path.join(userDataDir, 'uiState.json')
      const uiState = await getGistFileContent(files['uiState.json'])
      await writeFileEnsureDir(uiStatePath, uiState)
      if (isCodeServer) {
        initFrontendWebview(context)
        // Inform the frontend to update its IndexedDB UI state with the new data.
        const frontendPanel = await getFrontendPanel(context)
        frontendPanel.webview.postMessage({ command: 'gistSettingsSync.setUIState', data: uiState })
      }
    }
    if (config.includeProfiles && files['profiles.json']) {
      const profilesPath: string = path.join(userDataDir, 'profiles.json')
      await writeFileEnsureDir(profilesPath, await getGistFileContent(files['profiles.json']))
    }
    if (config.includeExtensions && files['extensions.json']) {
      const extensionsFromGist: string[] = JSON.parse(await getGistFileContent(files['extensions.json']))
      const installedExtensions: string[] = getInstalledExtensions()
      for (const extId of extensionsFromGist) {
        if (!installedExtensions.includes(extId)) {
          await vscode.commands.executeCommand('workbench.extensions.installExtension', extId)
        }
      }
    }
    vscode.window.showInformationMessage('Sync Down completed successfully')
  } catch (error: unknown) {
    if (error instanceof Error) {
      handleError('syncDown', error)
    }
  } finally {
    resetStatusBarItem()
  }
}
