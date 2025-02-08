import * as fs from 'fs/promises'
import * as path from 'path'

export * as fs from 'fs/promises';

/**
 * Reads a file if it exists, or returns null.
 */
export async function readFileIfExists(filePath: string): Promise<string | null> {
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
export async function writeFileEnsureDir(filePath: string, content: string): Promise<void> {
  const dir: string = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

/**
 * Reads all JSON snippet files from the snippets directory.
 */
export async function readSnippets(snippetsDir: string): Promise<Record<string, string>> {
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
