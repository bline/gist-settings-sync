import * as vscode from "vscode";
import { getSyncConfig, saveGistId, SyncConfig } from "./config";
import * as fileManager from "./fileManager";
import { uploadGist, downloadGist, createGist } from "./githubService";
import * as path from "path";
import { CronJob } from "cron";

interface SyncData {
  settings?: unknown;
  keybindings?: unknown;
  snippets?: Record<string, unknown>;
  tasks?: unknown;
  uiState?: unknown;
  profiles?: unknown;
  extensions?: string[];
}

// Retrieve the GitHub token from secret storage or prompt the user.
async function getGitHubToken(
  context: vscode.ExtensionContext,
): Promise<string> {
  let token = process.env.GITHUB_TOKEN;
  if (!token) {
    token =
      (await vscode.window.showInputBox({
        prompt: "Enter your GitHub token for Gist access",
        ignoreFocusOut: true,
        password: true,
      })) || "";
    if (!token) {
      throw new Error("GitHub token is required.");
    }
    process.env.GITHUB_TOKEN = token;
  }
  return token;
}

// Determine the paths for the various files to be synced.
function getPaths(config: SyncConfig): {
  settings: string;
  keybindings: string;
  tasks: string;
  uiState: string;
  profiles: string;
  snippetsDir: string;
} {
  const base = config.userDataDir;
  return {
    settings: path.join(base, "settings.json"),
    keybindings: path.join(base, "keybindings.json"),
    tasks: path.join(base, "tasks.json"),
    uiState: path.join(base, "uiState.json"),
    profiles: path.join(base, "profiles.json"),
    snippetsDir: path.join(base, "snippets"),
  };
}

// Sync local settings up to the configured GitHub Gist.
export async function syncUp(context: vscode.ExtensionContext): Promise<void> {
  const config = getSyncConfig();
  const token = await getGitHubToken(context);
  const paths = getPaths(config);
  const data: SyncData = {};

  if (config.includeSettings) {
    data.settings = await fileManager.readJSONFile(paths.settings);
  }
  if (config.includeKeybindings) {
    data.keybindings = await fileManager.readJSONFile(paths.keybindings);
  }
  if (config.includeSnippets) {
    data.snippets = await fileManager.readSnippets(paths.snippetsDir);
  }
  if (config.includeTasks) {
    data.tasks = await fileManager.readJSONFile(paths.tasks);
  }
  if (config.includeUIState) {
    data.uiState = await fileManager.readJSONFile(paths.uiState);
  }
  if (config.includeProfiles) {
    data.profiles = await fileManager.readJSONFile(paths.profiles);
  }
  if (config.includeExtensions) {
    // Get list of installed (non–built-in) extension IDs.
    data.extensions = vscode.extensions.all
      .filter((ext) => !ext.packageJSON.isBuiltin)
      .map((ext) => ext.id);
  }

  const content = JSON.stringify(data, null, 4);
  let { gistId } = config
  if (!gistId) {
    gistId = await createGist(token)
    saveGistId(gistId)
  }
  await uploadGist(gistId, token, content);
}

// Sync settings down from the GitHub Gist to the local user data directory.
export async function syncDown(
  context: vscode.ExtensionContext,
): Promise<void> {
  const config = getSyncConfig();
  const token = await getGitHubToken(context);
  if (!config.gistId) {
    throw new Error("Gist ID is not configured. syncUp first.");
  }
  const content = await downloadGist(config.gistId, token);
  const data: SyncData = JSON.parse(content);
  const paths = getPaths(config);

  if (config.includeSettings && data.settings !== undefined) {
    await fileManager.writeJSONFile(paths.settings, data.settings);
  }
  if (config.includeKeybindings && data.keybindings !== undefined) {
    await fileManager.writeJSONFile(paths.keybindings, data.keybindings);
  }
  if (config.includeSnippets && data.snippets !== undefined) {
    await fileManager.writeSnippets(
      paths.snippetsDir,
      data.snippets as Record<string, unknown>,
    );
  }
  if (config.includeTasks && data.tasks !== undefined) {
    await fileManager.writeJSONFile(paths.tasks, data.tasks);
  }
  if (config.includeUIState && data.uiState !== undefined) {
    await fileManager.writeJSONFile(paths.uiState, data.uiState);
  }
  if (config.includeProfiles && data.profiles !== undefined) {
    await fileManager.writeJSONFile(paths.profiles, data.profiles);
  }
  if (config.includeExtensions && data.extensions !== undefined) {
    await installMissingExtensions(data.extensions);
  }
}

// Install any extensions that are listed in the synced data but not currently installed.
async function installMissingExtensions(extensionIds: string[]): Promise<void> {
  const installed = vscode.extensions.all.map((ext) => ext.id.toLowerCase());
  for (const extId of extensionIds) {
    if (!installed.includes(extId.toLowerCase())) {
      try {
        await vscode.commands.executeCommand(
          "workbench.extensions.installExtension",
          extId,
        );
        vscode.window.showInformationMessage(`Installed extension: ${extId}`);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to install extension: ${extId}`);
      }
    }
  }
}

// Cron job reference.
let cronJob: CronJob | undefined;

// Schedule an automatic "sync up" job if a cron expression is configured.
export function scheduleCronSync(context: vscode.ExtensionContext): void {
  const config = getSyncConfig();
  if (config.cron) {
    try {
      if (cronJob) {
        cronJob.stop();
      }
      cronJob = new CronJob(config.cron, async () => {
        try {
          await syncUp(context);
          vscode.window.showInformationMessage(
            "Automatic settings sync up completed.",
          );
        } catch (err: unknown) {
          vscode.window.showErrorMessage(
            `Automatic sync up failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      });
      cronJob.start();
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to schedule cron sync: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
