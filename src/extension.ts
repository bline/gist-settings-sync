import * as vscode from 'vscode'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

interface SyncConfig {
  gistId: string
  cron: string
  includeSettings: boolean
  includeKeybindings: boolean
  includeSnippets: boolean
  includeTasks: boolean
  includeUIState: boolean
  includeProfiles: boolean
  includeExtensions: boolean
  userDataDir: string
  uiStateSyncInterval: number
}

interface WebviewMessage {
  command: string
  uiState?: unknown
  error?: string
}

let _statusBarItem: vscode.StatusBarItem | undefined
let frontendPanel: vscode.WebviewPanel | undefined

const isCodeServer: boolean = vscode.env.appName.toLowerCase().includes('code-server')

/**
 * Reads the extension configuration.
 */
function getConfig(): SyncConfig {
  const config = vscode.workspace.getConfiguration('gistSettingsSync')
  return {
    gistId: config.get<string>('gistId', ''),
    cron: config.get<string>('cron', ''),
    includeSettings: config.get<boolean>('includeSettings', true),
    includeKeybindings: config.get<boolean>('includeKeybindings', true),
    includeSnippets: config.get<boolean>('includeSnippets', true),
    includeTasks: config.get<boolean>('includeTasks', true),
    includeUIState: config.get<boolean>('includeUIState', true),
    includeProfiles: config.get<boolean>('includeProfiles', true),
    includeExtensions: config.get<boolean>('includeExtensions', true),
    userDataDir: config.get<string>('userDataDir', ''),
    uiStateSyncInterval: config.get<number>('uiStateSyncInterval', 10)
  }
}

/**
 * Returns the default user data directory (platform–dependent).
 */
function getDefaultUserDataDir(): string {
  const homeDir: string = os.homedir()
  if (isCodeServer) {
    return path.join(homeDir, '.local', 'share', 'code-server', 'User')
  } else if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'Code', 'User')
  } else if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Code', 'User')
  }
  return path.join(homeDir, '.config', 'Code', 'User')
}

/**
 * Returns the user data directory from configuration or the default.
 */
async function getUserDataDir(): Promise<string> {
  const config: SyncConfig = getConfig()
  if (config.userDataDir && config.userDataDir.trim() !== '') {
    return config.userDataDir
  }
  return getDefaultUserDataDir()
}

/**
 * Reads a file if it exists, or returns null.
 */
async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    const data: string = await fs.readFile(filePath, 'utf8')
    return data
  } catch (error: unknown) {
    return null
  }
}

/**
 * Writes a file, ensuring that the directory exists.
 */
async function writeFileEnsureDir(filePath: string, content: string): Promise<void> {
  const dir: string = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

/**
 * Reads all JSON snippet files from the snippets directory.
 */
async function readSnippets(snippetsDir: string): Promise<Record<string, string>> {
  const snippets: Record<string, string> = {}
  try {
    const files: string[] = await fs.readdir(snippetsDir)
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath: string = path.join(snippetsDir, file)
        const content: string | null = await readFileIfExists(filePath)
        if (content !== null) {
          snippets[file] = content
        }
      }
    }
  } catch (error: unknown) {
    // Folder may not exist; ignore.
  }
  return snippets
}

/**
 * Returns the list of installed (non–builtin) extension IDs.
 */
function getInstalledExtensions(): string[] {
  return vscode.extensions.all
    .filter((ext) => !ext.packageJSON.isBuiltin)
    .map((ext) => ext.id)
}

/**
 * Retrieves the GitHub token.
 * On code–server the token is read from the environment variable GITHUB_TOKEN.
 * On VS Code the token is stored/retrieved via the secrets API.
 */
async function getGithubToken(context: vscode.ExtensionContext): Promise<string> {
  if (isCodeServer) {
    const token: string | undefined = process.env.GITHUB_TOKEN
    if (!token) {
      throw new Error('GITHUB_TOKEN is not set in environment variables')
    }
    return token
  }
  const storedToken: string | undefined = await context.secrets.get('GITHUB_TOKEN')
  if (storedToken) {
    return storedToken
  }
  const token: string | undefined = await vscode.window.showInputBox({
    prompt: 'Enter your GitHub token with Gist permissions'
  })
  if (!token) {
    throw new Error('GitHub token not provided')
  }
  await context.secrets.store('GITHUB_TOKEN', token)
  return token
}

/**
 * Returns the HTML content for the hidden webview.
 * The injected script uses IndexedDB to extract all databases with the prefix
 * "vscode-web-state-db" (including ones with unique workspace IDs) and sends that data
 * to the backend on login and periodically. It also implements a setUIState function
 * that updates each database’s object stores with the provided new state.
 *
 * The sync interval (in milliseconds) is injected into the page.
 */
async function getWebviewContent(
  context: vscode.ExtensionContext,
  syncIntervalMillis: number
): Promise<string> {
  const scriptUri: vscode.Uri = vscode.Uri.joinPath(
    context.extensionUri,
    'web',
    'webview.js'
  )
  const scriptBytes: Uint8Array = await vscode.workspace.fs.readFile(scriptUri)
  const scriptContent: string = scriptBytes.toString()

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Gist Settings Sync Frontend</title>
  </head>
  <body style="display: none">
    <script>
      // Inject the sync interval as a global variable.
      window.syncIntervalMillis = ${syncIntervalMillis}
    </script>
    <script>
      ${scriptContent}
    </script>
  </body>
</html>`
}


/**
 * Initializes the hidden frontend webview (only for code–server).
 * This webview will periodically extract the UI state from IndexedDB and send it
 * to the backend. The sync interval is based on the configuration.
 */
async function initFrontendWebview(context: vscode.ExtensionContext): Promise<void> {
  if (frontendPanel) {
    return
  }
  const config: SyncConfig = getConfig()
  const syncIntervalMillis: number = config.uiStateSyncInterval * 60 * 1000
  frontendPanel = vscode.window.createWebviewPanel(
    'gistSettingsSyncFrontend',
    'Gist Settings Sync Frontend',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  )
  frontendPanel.webview.html = await getWebviewContent(context, syncIntervalMillis)
  frontendPanel.webview.onDidReceiveMessage((message: WebviewMessage) => {
    if (message?.command) {
      const cmd = message.command
      const statusBarItem = getStatusBarItem()
      switch (cmd) {
        case 'gistSettingsSync.syncUiStateStart':
          statusBarItem.text = '$(sync~spin) Syncing UI State...'
          break
        case 'gistSettingsSync.syncUiStateFinish':
          statusBarItem.text = '$(sync) Sync'
          break
        case 'gistSettingsSync.syncUiState':
          if (message.uiState) {
            // Process the UI state payload, e.g., write to disk.
            ; (async () => {
              try {
                const userDataDir: string = await getUserDataDir()
                const uiStatePath: string = path.join(userDataDir, 'uiState.json')
                await writeFileEnsureDir(uiStatePath, JSON.stringify(message.uiState, null, 2))
              } catch (err: unknown) {
                console.error('Failed to write UI state:', err)
              }
            })()
          }
          if (message.error) {
            console.error('Error syncing UI state:', message.error)
          }
          break
      }
    }
  })

}

/**
 * The Sync Up command: Reads the selected configuration files, builds a payload,
 * and sends it to the specified GitHub Gist.
 */
async function syncUp(context: vscode.ExtensionContext): Promise<void> {
  const statusBarItem: vscode.StatusBarItem = getStatusBarItem()
  statusBarItem.text = '$(sync~spin) Syncing Up...'
  statusBarItem.show()
  try {
    const config: SyncConfig = getConfig()
    const userDataDir: string = await getUserDataDir()
    const files: Record<string, { content: string }> = {}

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
        codeServerVersion: isCodeServer ? process.env.CODE_SERVER_VERSION || 'unknown' : null,
        vscodeVersion: vscode.version
      })
    }

    const token: string = await getGithubToken(context)
    if (!config.gistId) {
      throw new Error('Gist ID is not set in configuration')
    }
    const url: string = `https://api.github.com/gists/\${config.gistId}`
    const response: Response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `token \${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files })
    })
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`)
    }
    vscode.window.showInformationMessage('Sync Up completed successfully')
  } catch (error: unknown) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(`Sync Up failed: ${error.message}`)
    }
  } finally {
    statusBarItem.text = '$(sync) Sync'
  }
}

/**
 * The Sync Down command: Retrieves configuration data from the GitHub Gist,
 * writes files to disk, updates the frontend UI state (on code–server), and installs missing extensions.
 */
async function syncDown(context: vscode.ExtensionContext): Promise<void> {
  const statusBarItem: vscode.StatusBarItem = getStatusBarItem()
  statusBarItem.text = '$(sync~spin) Syncing Down...'
  statusBarItem.show()
  try {
    const config: SyncConfig = getConfig()
    const userDataDir: string = await getUserDataDir()
    const token: string = await getGithubToken(context)
    if (!config.gistId) {
      throw new Error('Gist ID is not set in configuration')
    }
    const url: string = `https://api.github.com/gists/${config.gistId}`
    const response: Response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    })
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`)
    }
    const gistData = await response.json() as { files: Record<string, { content: string }> }
    const files: Record<string, { content: string }> = gistData.files

    if (config.includeSettings && files['settings.json']) {
      const settingsPath: string = path.join(userDataDir, 'settings.json')
      await writeFileEnsureDir(settingsPath, files['settings.json'].content)
    }
    if (config.includeKeybindings && files['keybindings.json']) {
      const keybindingsPath: string = path.join(userDataDir, 'keybindings.json')
      await writeFileEnsureDir(keybindingsPath, files['keybindings.json'].content)
    }
    if (config.includeSnippets && files['snippets.json']) {
      const snippetsDir: string = path.join(userDataDir, 'snippets')
      const snippetsObj: Record<string, string> = JSON.parse(files['snippets.json'].content)
      await fs.mkdir(snippetsDir, { recursive: true })
      for (const [fileName, content] of Object.entries(snippetsObj)) {
        const snippetPath: string = path.join(snippetsDir, fileName)
        await writeFileEnsureDir(snippetPath, content)
      }
    }
    if (config.includeTasks && files['tasks.json']) {
      const tasksPath: string = path.join(userDataDir, 'tasks.json')
      await writeFileEnsureDir(tasksPath, files['tasks.json'].content)
    }
    if (config.includeUIState && files['uiState.json']) {
      const uiStatePath: string = path.join(userDataDir, 'uiState.json')
      await writeFileEnsureDir(uiStatePath, files['uiState.json'].content)
      if (isCodeServer) {
        initFrontendWebview(context)
        // Inform the frontend to update its IndexedDB UI state with the new data.
        frontendPanel!.webview.postMessage({ command: 'gistSettingsSync.setUIState', data: files['uiState.json'].content })
      }
    }
    if (config.includeProfiles && files['profiles.json']) {
      const profilesPath: string = path.join(userDataDir, 'profiles.json')
      await writeFileEnsureDir(profilesPath, files['profiles.json'].content)
    }
    if (config.includeExtensions && files['extensions.json']) {
      const extensionsFromGist: string[] = JSON.parse(files['extensions.json'].content)
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
      vscode.window.showErrorMessage(`Sync Down failed: ${error.message}`)
    }
  } finally {
    statusBarItem.text = '$(sync) Sync'
  }
}

/**
 * Returns (and creates if needed) a status bar item.
 */
function getStatusBarItem(): vscode.StatusBarItem {
  if (!_statusBarItem) {
    _statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
    _statusBarItem.text = '$(sync) Sync'
    _statusBarItem.command = 'gistSettingsSync.syncUp'
    _statusBarItem.show()
  }
  return _statusBarItem
}

/**
 * Called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('gistSettingsSync.syncUp', () => {
      syncUp(context)
    })
  )
  context.subscriptions.push(
    vscode.commands.registerCommand('gistSettingsSync.syncDown', () => {
      syncDown(context)
    })
  )
  // Initialize the status bar item.
  getStatusBarItem()

  // For code–server: if UI state sync is enabled, initialize the hidden frontend webview.
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('gistSettingsSync.includeUIState')) {
      const config: SyncConfig = getConfig()
      if (!config.includeUIState && frontendPanel) {
        frontendPanel.dispose()
        frontendPanel = undefined
      } else if (config.includeUIState && isCodeServer && !frontendPanel) {
        initFrontendWebview(context)
      }
    }
  })
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  if (_statusBarItem) {
    _statusBarItem.dispose()
  }
  if (frontendPanel) {
    frontendPanel.dispose()
  }
}
