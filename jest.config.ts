import type { Config } from 'jest'
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^vscode$': '<rootDir>/tests/__mocks__/vscode.ts' // Ensure Jest maps the vscode mock correctly
  },
  testMatch: ['**/tests/**/*.test.ts'], // Matches your test files
  globals: {
    'ts-jest': {
      tsconfig: 'tests/tsconfig.json' // Point to your existing tsconfig
    }
  }
}
export default config
