import vscode from 'vscode'

/**
 * Type definition for the actions to be taken when meta information conflicts.
 */
export type MetaCheckAction = 'ask' | 'sync' | 'cancel'

// Define the configuration properties with their types and default values
const configurationProperties: Record<string, { defaultValue: any; type: string }> = {
  /**
   * The GitHub Gist ID to sync settings to/from.
   */
  gistId: { defaultValue: '', type: 'string' },
  /**
   * Cron expression for automatic sync (e.g. '0 * * * *' for every hour). Leave empty to disable.
   */
  cron: { defaultValue: '', type: 'string' },
  /**
   * Include user settings in sync.
   */
  includeSettings: { defaultValue: true, type: 'boolean' },
  /**
   * Include keyboard shortcuts in sync.
   */
  includeKeybindings: { defaultValue: true, type: 'boolean' },
  /**
   * Include user snippets in sync.
   */
  includeSnippets: { defaultValue: true, type: 'boolean' },
  /**
   * Include user tasks in sync.
   */
  includeTasks: { defaultValue: true, type: 'boolean' },
  /**
   * Include UI state in sync.
   */
  includeUIState: { defaultValue: true, type: 'boolean' },
  /**
   * Include profiles in sync.
   */
  includeProfiles: { defaultValue: true, type: 'boolean' },
  /**
   * Include list of extensions in sync and auto–install missing ones.
   */
  includeExtensions: { defaultValue: true, type: 'boolean' },
  /**
   * Path to the user data directory (e.g. where settings.json is stored). Leave empty for default.
   */
  userDataDir: { defaultValue: '', type: 'string' },
  /**
   * The number of minutes between UI syncs in code-server. Code Server stores UI State in IndexedDB
   * in the frontend. This is how often we sync that data to the backend.
   * Only used if `includeUIState` is enabled and on code-server.
   */
  uiStateSyncInterval: { defaultValue: 10, type: 'number' },
  /**
   * What to do when syncing up and the meta information for the current configuration conflicts
   * with what is stored in the Gist.
   */
  syncUpMetaCheckAction: { defaultValue: 'ask', type: 'string' as 'string' }, // Enforce type as 'string'
  /**
   * What to do when syncing down and the meta information for the current configuration conflicts
   * with what is stored in the Gist.
   */
  syncDownMetaCheckAction: { defaultValue: 'ask', type: 'string' as 'string' }, // Enforce type as 'string'
}

/**
 * Type definition for configuration keys.
 */
export type ConfigurationKey = keyof typeof configurationProperties
/**
 * Type definition for configuration values.
 */
export type ConfigurationValue = string | MetaCheckAction | number | boolean | null

/**
 * Type definition for configuration change listeners.
 */
type ConfigurationListener = (key: ConfigurationKey, newValue: ConfigurationValue) => void
/**
 * Type definition for a record of configuration listeners.
 */
type ConfigurationListeners = Record<ConfigurationKey, Array<ConfigurationListener>>

/**
 * The scope used for VS Code configuration.
 */
const configurationScope = 'gistSettingsSync'

/**
 * Class to manage configuration settings and notify listeners on changes.
 */
export class ConfigurationManager {
  /**
   * A record of listeners for configuration changes.
   */
  private listeners: ConfigurationListeners = {} as ConfigurationListeners
  /**
   * The current configuration values.
   */
  private current: { [key in ConfigurationKey]: ConfigurationValue } = {} as {
    [key in ConfigurationKey]: ConfigurationValue
  }

  /**
   * Constructor for the ConfigurationManager class.
   * @param context The VS Code extension context.
   */
  constructor(context: vscode.ExtensionContext) {
    // Initialize listeners and current configuration
    for (const key in configurationProperties) {
      this.listeners[key as ConfigurationKey] = []
      this.current[key as ConfigurationKey] = vscode.workspace
        .getConfiguration(configurationScope)
        .get(key, configurationProperties[key].defaultValue)
    }

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        this.updateConfiguration(event)
      }),
    )
  }

  /**
   * Updates the configuration values and notifies listeners on changes.
   * @param event The configuration change event.
   */
  private updateConfiguration(event: vscode.ConfigurationChangeEvent) {
    const config = vscode.workspace.getConfiguration(configurationScope)
    for (const key in configurationProperties) {
      if (event.affectsConfiguration(`${configurationScope}.${key}`)) {
        const newValue = config.get(key, configurationProperties[key].defaultValue)
        this.current[key as ConfigurationKey] = newValue
        this.notifyListeners(key as ConfigurationKey, newValue)
      }
    }
  }

  /**
   * Adds a listener for configuration changes.
   * @param key The configuration key to listen for.
   * @param listener The listener function to be called on changes.
   */
  public addListener(key: ConfigurationKey, listener: ConfigurationListener) {
    this.listeners[key].push(listener)
  }

  /**
   * Removes a listener for configuration changes.
   * @param key The configuration key.
   * @param listener The listener function to be removed.
   */
  public removeListener(key: ConfigurationKey, listener: ConfigurationListener) {
    this.listeners[key] = this.listeners[key].filter((l) => l !== listener)
  }

  /**
   * Gets the current value of a configuration setting.
   * @param key The configuration key.
   * @returns The current value of the configuration setting.
   */
  public get(key: ConfigurationKey): ConfigurationValue {
    return this.current[key]
  }

  /**
   * Notifies listeners about a configuration change.
   * @param key The configuration key that changed.
   * @param newValue The new value of the configuration setting.
   */
  private notifyListeners(key: ConfigurationKey, newValue: ConfigurationValue) {
    this.listeners[key].forEach((listener) => listener(key, newValue))
  }
}
