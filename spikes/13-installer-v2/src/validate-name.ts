/**
 * Project name rules, reused unchanged in spirit from `packages/create-strutvane/src/validate-name.ts`.
 *
 * The name becomes the folder name, the `name` in package.json and the Docker Compose project name,
 * so it must be valid for npm and safe as a folder on Windows, macOS and Linux.
 *
 * @module
 */

/** Names Windows refuses as file or folder names, whatever the extension (`con`, `nul.txt` ...). */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i

/** Names npm refuses as package names. */
const NPM_BLOCKED = new Set(['node_modules', 'favicon.ico'])

/**
 * Check a project name and return every problem, in plain words (an empty array means valid).
 *
 * Why every problem at once: a user fixing a name should not have to retry once per rule.
 *
 * @example
 * validateProjectName('acme-portal') // []
 * validateProjectName('My App')      // ['the project name must be lowercase', '... spaces ...']
 */
export function validateProjectName(name: string): string[] {
  if (name.length === 0) return ['a project name is required (for example "my-app")']
  const problems: string[] = []
  if (name.length > 214) problems.push('the project name must be 214 characters or fewer')
  if (name !== name.toLowerCase()) problems.push('the project name must be lowercase')
  if (/\s/.test(name)) problems.push('the project name cannot contain spaces (use "-")')
  if (/^[._]/.test(name)) problems.push('the project name cannot start with "." or "_"')
  if (name.startsWith('-')) problems.push('the project name cannot start with "-"')
  if (/[/\\]/.test(name)) problems.push('the project name cannot contain "/" or "\\"')
  // Checked on the name without spaces and slashes, so one bad character is reported only once.
  const rest = name.replace(/\s/g, '').replace(/[/\\]/g, '')
  if (!/^[a-z0-9._~-]*$/i.test(rest)) {
    problems.push('the project name may only contain letters, digits, "-", ".", "_" and "~"')
  }
  if (name.endsWith('.')) problems.push('the project name cannot end with "." (Windows drops it)')
  if (NPM_BLOCKED.has(name.toLowerCase())) problems.push(`"${name}" is not allowed by npm`)
  if (WINDOWS_RESERVED.test(name)) problems.push(`"${name}" is a reserved name on Windows`)
  return problems
}
