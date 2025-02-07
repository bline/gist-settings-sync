
# Gist Settings Sync for code-server

**Gist Settings Sync** is an extension for [code-server](https://github.com/coder/code-server) and VS Code that lets you synchronize your settings, keybindings, extensions, UI state, and more to a GitHub Gist. It works seamlessly in both VS Code and code-server, even handling unique UI state syncing on code-server (which stores state in IndexedDB).

---

## Features

- **One-click Up/Down Sync**
  Use either the command palette or keyboard shortcuts to upload (sync up) your local configurations to a GitHub Gist, or download (sync down) the Gist’s configurations to your environment.

- **Automatic UI State Sync for code-server**
  This extension uses an invisible webview that periodically polls IndexedDB in the browser to extract or apply UI state data. This ensures that your code-server UI state remains in sync even if you switch machines or browsers.

- **Extensions Installation**
  When you sync down, the extension automatically installs any missing extensions that were defined in your Gist.

- **Configurable Behavior**
  You can specify which kinds of files are synced (settings, keybindings, snippets, tasks, profiles, extensions, UI state, etc.) as well as the Gist ID and Cron-like schedules for automation.

---

## Requirements

- **code-server 4.96.4** (or later) **OR** VS Code 1.96.4 (or later)
- **GitHub Personal Access Token** with Gist permissions
  - For code-server: expose it via the `GITHUB_TOKEN` environment variable.
  - For VS Code: the extension will prompt you to store the token via the secrets API.

---

## Installation

### 1. Build and Package

1. **Clone or download** this repository.
2. **Install dependencies** (if needed):
   ```
   npm install
   ```
3. **Package the extension**:
   ```
   npx vsce package
   ```
   This will produce a `.vsix` file in the project folder.

### 2. Install the VSIX File

- **code-server**:
  1. Copy the `.vsix` file to your code-server environment.
  2. Run the following command in your code-server terminal:
     ```
     code-server --install-extension <path-to-your-vsix>
     ```
  3. Restart code-server.

- **VS Code**:
  1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to open the command palette.
  2. Type “Extensions: Install from VSIX...” and select your `.vsix` file.
  3. Reload or restart VS Code.

---

## Usage

1. **Set Your Gist ID and Token**
   - For code-server, set the environment variable `GITHUB_TOKEN` to your personal access token.
   - For VS Code, after installing the extension, run any sync command and you will be prompted to provide your token if you haven’t already.
   - Configure the Gist ID in your VS Code settings (or code-server’s settings UI):
     ```
     "gistSettingsSync.gistId": "YOUR_GIST_ID"
     ```

2. **Trigger Sync Commands**
   - **Sync Up** (`gistSyncSettings.syncUp`): Upload local settings to your GitHub Gist.
   - **Sync Down** (`gistSyncSettings.syncDown`): Download settings from your GitHub Gist to your local environment.
   - Both commands can be accessed from the command palette or via the **status bar** (click the Sync icon). By default, there are also keybindings:
     - **Ctrl+Alt+U** for Sync Up
     - **Ctrl+Alt+D** for Sync Down

3. **Automatic UI State Sync**
   - When `gistSettingsSync.includeUIState` is enabled (default: true), code-server’s UI state (stored in IndexedDB) is automatically synced in the background.
   - The interval is configurable via `gistSettingsSync.uiStateSyncInterval` (in minutes).
   - You will see a rotating icon in the status bar whenever UI state extraction or application is in progress.

---

## Configuration

Add these to your **settings.json** (VS Code or code-server):

```json
{
  "gistSettingsSync.gistId": "<YOUR_GIST_ID>",
  "gistSettingsSync.cron": "",
  "gistSettingsSync.includeSettings": true,
  "gistSettingsSync.includeKeybindings": true,
  "gistSettingsSync.includeSnippets": true,
  "gistSettingsSync.includeTasks": true,
  "gistSettingsSync.includeUIState": true,
  "gistSettingsSync.includeProfiles": true,
  "gistSettingsSync.includeExtensions": true,
  "gistSettingsSync.userDataDir": "",
  "gistSettingsSync.uiStateSyncInterval": 10
}
```

- `gistId`: ID of the GitHub Gist used for syncing.
- `cron`: Optional cron expression to schedule automatic syncing (on code-server or VS Code).
- `includeSettings`, `includeKeybindings`, etc.: Enable or disable specific file syncs.
- `userDataDir`: Manually specify the user data directory if needed.
- `uiStateSyncInterval`: Interval in minutes for UI state extraction and sync (code-server only).

---

## Meta and Versioning

The extension will also create a `meta.json` in your Gist, storing version details:

```json
{
  "appName": "code-server",
  "appHost": "desktop",
  "codeServerVersion": "4.96.4",
  "vscodeVersion": "1.96.4"
}
```

You can use this metadata to warn users of potential incompatibilities or apply migrations if needed.

---

## License

MIT License


---

## Contributing

Please feel free to open issues or submit pull requests to improve this extension.

---

## Contact

If you have any questions or run into issues:
- [Open an Issue on GitHub](https://github.com/bline/gist-settings-sync/issues)
- Or email: [maintainer@example.com](mailto:scottbeck@gmail.com)
