import * as fs from 'fs/promises'
import * as path from 'path'

export * as fs from 'fs/promises'

/**
 * Reads a file if it exists, or returns null.
 */
export async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    const data: string = await fs.readFile(filePath, 'utf8')
    return data
  } catch (_: unknown) {
    return null
  }
}

/**
 * Writes a file, ensuring that the directory exists.
 */
export async function writeFileEnsureDir(filePath: string, content: string): Promise<void> {
  const dir: string = path.dirname(filePath)
  await fs.mkdir(dir, {recursive: true})
  await fs.writeFile(filePath, content, 'utf8')
}
