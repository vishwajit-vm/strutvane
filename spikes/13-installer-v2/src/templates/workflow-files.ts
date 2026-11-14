/**
 * Files around the app rather than in it: the CI workflow, editor settings, the deploy recipe,
 * and the two opt-in container setups.
 *
 * Docker files, two different rules:
 * - the local Sail-style stack (`docker/compose.yaml`, compose.ts) is git-ignored (ADR-0006);
 * - a production `Dockerfile` + `.dockerignore` (deploy target "Docker image") and a
 *   `.devcontainer/` (question 36) are committed, but ONLY when the developer picks them
 *   (ADR-0021). They never contain or copy a secret: settings arrive as environment variables
 *   at runtime, and `.dockerignore` keeps every `.env*` file out of the build context.
 *
 * @module
 */
import type { ProjectOptions } from '../options.ts'
import type { GeneratedFile } from './app-files.ts'

/** The Node major the containers pin (the generated app's engines field says >=24.3). */
export const CONTAINER_NODE_MAJOR = 24

/**
 * Every workflow/deploy file these options ask for.
 *
 * @example
 * workflowFiles(options).map((f) => f.path) // ['.github/workflows/ci.yml', '.vscode/settings.json', ...]
 */
export function workflowFiles(options: ProjectOptions): GeneratedFile[] {
  const files: GeneratedFile[] = []
  if (options.ci) files.push({ path: '.github/workflows/ci.yml', content: ciWorkflow(options) })
  if (options.editor) files.push(...editorFiles(options))
  if (options.devContainer) files.push(...devContainerFiles(options))
  if (options.deploy !== 'later') files.push({ path: 'deploy/README.md', content: deployRecipe(options) })
  if (options.deploy === 'docker') {
    files.push({ path: 'Dockerfile', content: dockerfile(options) }, { path: '.dockerignore', content: DOCKERIGNORE })
  }
  return files
}

/** GitHub Actions: install exactly the locked versions, then run the tests. Read-only token. */
function ciWorkflow(options: ProjectOptions): string {
  const test = options.testing === 'none' ? '' : '\n      - run: npm test'
  return `# Runs on every push and pull request. Action versions pinned to a major tag (unverified for
# your date: check for newer majors). The token is read-only.
name: CI
on: [push, pull_request]
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${CONTAINER_NODE_MAJOR}
          cache: npm
      # Same as the first install: the lockfile's versions, no install scripts.
      - run: npm ci --ignore-scripts${test}
`
}

/** VS Code: Biome formats on save; the recommended extensions match the chosen tools. */
function editorFiles(options: ProjectOptions): GeneratedFile[] {
  const extensions = ['biomejs.biome', ...(options.testing === 'vitest-playwright' ? ['ms-playwright.playwright'] : [])]
  const settings = {
    'editor.formatOnSave': true,
    'editor.defaultFormatter': 'biomejs.biome',
    'editor.codeActionsOnSave': { 'source.organizeImports.biome': 'explicit' },
    'typescript.tsdk': 'node_modules/typescript/lib',
  }
  return [
    { path: '.vscode/settings.json', content: `${JSON.stringify(settings, null, 2)}\n` },
    { path: '.vscode/extensions.json', content: `${JSON.stringify({ recommendations: extensions }, null, 2)}\n` },
  ]
}

/**
 * Dev container for Codespaces / VS Code Dev Containers (ADR-0021, opt-in, committed). Only the
 * app container: settings come from the git-ignored `.env` at runtime (optional, so a fresh
 * Codespace still opens), never from these files.
 */
function devContainerFiles(options: ProjectOptions): GeneratedFile[] {
  const devcontainer = {
    name: options.name,
    dockerComposeFile: 'compose.yaml',
    service: 'app',
    workspaceFolder: '/workspace',
    forwardPorts: [3000],
    // No install scripts, exactly like the installer (security review F-12).
    postCreateCommand: 'npm ci --ignore-scripts',
    remoteUser: 'node',
    customizations: { vscode: { extensions: ['biomejs.biome'] } },
  }
  return [
    { path: '.devcontainer/devcontainer.json', content: `${JSON.stringify(devcontainer, null, 2)}\n` },
    {
      path: '.devcontainer/compose.yaml',
      content: `# Dev container (ADR-0021: committed because you chose it in the installer).
# No secrets here: the app reads ../.env at runtime (git-ignored; create it with npm run setup,
# or set Codespaces secrets). Database: SQLite works as is; for MySQL/PostgreSQL point DB_* at a
# server you run. The local Sail-style stack is separate: docker/compose.yaml (git-ignored, ADR-0006).
services:
  app:
    image: node:${CONTAINER_NODE_MAJOR}-bookworm
    command: sleep infinity
    user: node
    working_dir: /workspace
    volumes:
      - ..:/workspace:cached
    env_file:
      - path: ../.env
        required: false
`,
    },
  ]
}

/** The deploy recipe for the chosen target (plain steps; the platform holds the secrets). */
function deployRecipe(options: ProjectOptions): string {
  const common = `Settings come from environment variables set in your host's dashboard (the keys are listed in
\`.env.example\`). Never upload \`.env\`. The app answers \`GET /up\` with "up" for health checks.`
  if (options.deploy === 'docker') {
    return `# Deploy ${options.name} as a Docker image

\`\`\`text
docker build -t ${options.name} .
docker run -p 3000:3000 --env APP_KEY=... --env DB_HOST=... ${options.name}
\`\`\`

Works on Kubernetes, Fly, Cloud Run, ECS and any container host. The \`Dockerfile\` builds in a
separate stage, ships only \`build/\` and production dependencies, runs as the non-root \`node\`
user and checks \`/up\`. \`.dockerignore\` keeps \`.env*\`, \`.git\`, \`node_modules\`, \`storage/\`
and tests out of the image. Regenerate both files later with \`node strut docker:prod\`.

${common}
`
  }
  return `# Deploy ${options.name} to a Node host (VPS, Railway, Render)

\`\`\`text
npm ci --ignore-scripts
node strut build
node strut migrate --force
npm start            (node build/server.js)
\`\`\`

${common}
`
}

/**
 * The production image (ADR-0021). Three stages so the final image holds only what runs:
 * no dev dependencies, no sources, no tests, no secrets, and a non-root user.
 */
function dockerfile(options: ProjectOptions): string {
  const node = `node:${CONTAINER_NODE_MAJOR}-bookworm-slim`
  return `# syntax=docker/dockerfile:1
# Production image for ${options.name} (ADR-0021: committed because you chose "Docker image").
# Secrets are never copied in: .dockerignore excludes every .env* file, and the platform passes
# settings as environment variables when the container starts. Regenerate: node strut docker:prod

# 1. Build: install everything (dev dependencies too) and compile to build/.
FROM ${node} AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# Spike only: the local stand-ins for the @strutvane packages (the release installs from npm).
COPY stubs/ ./stubs/
RUN npm ci --ignore-scripts
COPY . .
RUN node strut build

# 2. Production dependencies only.
FROM ${node} AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY stubs/ ./stubs/
RUN npm ci --omit=dev --ignore-scripts

# 3. Run: only build/ and production dependencies, as the image's non-root "node" user.
FROM ${node}
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/stubs ./stubs
COPY --from=build --chown=node:node /app/build ./build
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \\
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.APP_PORT || 3000) + '/up').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "build/server.js"]
`
}

/**
 * What never enters the build context (ADR-0021). The first five lines are required by the ADR
 * and checked by tests: secrets, git history, local installs, local data and tests.
 */
export const DOCKERIGNORE = `# Never sent to docker build (ADR-0021): secrets, git history, local installs, data and tests.
.env*
.git
node_modules
storage/
tests/
**/*.test.ts
**/*.spec.ts
# Local-only things that have no place in an image.
docker/
.strutvane/
.devcontainer/
.vscode/
database/*.sqlite*
`
