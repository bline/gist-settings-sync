import * as fs from "fs/promises";
import * as path from "path";

export async function readJSONFile<T>(
  filePath: string,
): Promise<T | undefined> {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data) as T;
  } catch (err) {
    // File might not exist.
    return undefined;
  }
}

export async function writeJSONFile(
  filePath: string,
  data: unknown,
): Promise<void> {
  const json = JSON.stringify(data, null, 4);
  await fs.writeFile(filePath, json, "utf8");
}

export async function readTextFile(
  filePath: string,
): Promise<string | undefined> {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return data;
  } catch (err) {
    return undefined;
  }
}

export async function writeTextFile(
  filePath: string,
  data: string,
): Promise<void> {
  await fs.writeFile(filePath, data, "utf8");
}

export async function readSnippets(
  snippetsDir: string,
): Promise<Record<string, unknown>> {
  const snippets: Record<string, unknown> = {};
  try {
    const files = await fs.readdir(snippetsDir);
    for (const file of files) {
      if (file.endsWith(".json")) {
        const fullPath = path.join(snippetsDir, file);
        const content = await readJSONFile(fullPath);
        if (content !== undefined) {
          snippets[file] = content;
        }
      }
    }
  } catch (err) {
    // Directory might not exist.
  }
  return snippets;
}

export async function writeSnippets(
  snippetsDir: string,
  snippets: Record<string, unknown>,
): Promise<void> {
  try {
    await fs.mkdir(snippetsDir, { recursive: true });
    for (const [fileName, content] of Object.entries(snippets)) {
      const filePath = path.join(snippetsDir, fileName);
      await writeJSONFile(filePath, content);
    }
  } catch (err) {
    throw err;
  }
}
