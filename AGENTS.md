# TaskPilot Agent Instructions

## Session Start

- First fetch and read the shared Notion rules page. If Notion MCP is unavailable, do not pretend it was read; notify the user and stop.
  - Tool: `Notion:notion-fetch`
  - `id`: `https://www.notion.so/CLAUDE-md-354db6413de580ebb53cc757ec2433ea`
- Check the current working directory and `git status --short` before editing.
- This is the source repository for the `taskpilot` VS Code extension, not an installed extension bundle.
- Do not edit user-local secrets or environment files. `.env` exists locally and must not be read into output or committed.

## Project Overview

- Extension name: `taskpilot`
- Publisher: `hollySizzle`
- Current release line: `0.6.x`
- Entry point: `dist/extension.js`
- Source root: `src/`
- Config file used by the extension: `.vscode/task-menu.yaml` by default
- YAML schema: `schemas/taskpilot.schema.json`
- Sidebar/webview assets: `media/`, `src/webview/`
- Build output:
  - TypeScript test output: `out/`
  - Bundled extension output: `dist/`

TaskPilot provides a VS Code sidebar/menu for running configured actions from YAML. Menu items can contain child items, or action arrays executed sequentially.

## Core Action Types

Supported action types include:

- `terminal`: creates or reuses a VS Code terminal and sends text. It does not wait for shell command completion after `sendText`.
- `shellCommand`: runs a shell command through Node `child_process.exec`, waits for completion, and writes stdout/stderr to the `TaskPilot` output channel.
- `vscodeCommand`: executes a VS Code command via `vscode.commands.executeCommand` and awaits the command promise.
- `task`: executes a VS Code task.
- `openInDevContainer`
- `openRemoteSSH`
- `openRemoteTunnel`

Important behavior:

- Actions in a single item run sequentially.
- `terminal` sequencing only waits until text is sent, not until the terminal process exits.
- Use `shellCommand` when later actions must wait for a shell command to finish.
- `children` are menu hierarchy, not an execution queue.

## Recent Design Context

Version `0.6.4` added `shellCommand` to support workflows such as:

1. Run `tmux-integrated.newTerminal` through `vscodeCommand`.
2. Poll tmux externally with a waiting `shellCommand`.
3. Send a command into the newly created tmux window using `tmux send-keys`.

This exists because `tmux-integrated` owns terminal creation and TaskPilot's original `terminal` action could not wait for terminal-side shell completion.

The user-local `.vscode/task-menu.yaml` may contain personal workflows that depend on:

- `pcassidy75.tmux-integrated`
- `tmux`
- `mozyo-bridge`

Do not assume those personal workflows should be committed. `.vscode/` is generally local workspace configuration.

## Main Files To Inspect

- `src/types.ts`: menu/action type definitions.
- `src/yaml-parser.ts`: YAML parse and validation rules.
- `src/action-executor.ts`: action execution implementation.
- `src/config-manager.ts`: config loading and global menu handling.
- `src/config-editor-panel.ts`: built-in config editor UI.
- `scripts/generate-schema.ts`: schema generation.
- `schemas/taskpilot.schema.json`: generated YAML schema.
- `package.json`: VS Code contributions, command metadata, scripts, version.
- `README.md`: public usage documentation.
- `src/test/suite/`: extension test suites.
- `media/__tests__/`: Jest webview tests.
- `src/test/runTest.ts` and `src/test/e2e/runTest.ts`: VS Code extension test runners.

## Development Rules

- Prefer existing architecture over adding new abstraction.
- Keep action behavior explicit and predictable. Do not make `terminal` wait implicitly; that would be a behavioral break.
- If adding or changing an action type, update all of:
  - `src/types.ts`
  - `src/yaml-parser.ts`
  - `src/action-executor.ts`
  - `package.json` configuration enum
  - `schemas/taskpilot.schema.json`
  - `README.md`
  - relevant tests
- Regenerate schema with `npm run generate:schema` after action/config type changes.
- Avoid broad formatting churn.
- Do not commit `.vscode-test/`, coverage output, local VSIX test artifacts, or secrets.

## Validation

Use these checks before release-level changes:

```bash
npm run compile:tsc -- --pretty false
npm run lint
npm test
npm run test:e2e
npm run test:webview
npm run compile
```

Notes:

- `npm test` and `npm run test:e2e` use `@vscode/test-electron`.
- On macOS with VS Code 1.119+, the test runner must use the VS Code CLI path resolved from the downloaded executable. This is already handled in `src/test/runTest.ts` and `src/test/e2e/runTest.ts`.
- `npm run compile` rebuilds `src/webview/styles.ts` and `dist/extension.js`.

## Release

Marketplace publishing is handled by GitHub Actions:

- Workflow: `.github/workflows/publish.yml`
- Trigger: push a tag matching `v*`
- Publish command: `npx @vscode/vsce publish -p ${{ secrets.VSCE_PAT }}`

Typical release flow:

```bash
npm version patch --no-git-tag-version
npm run compile:tsc -- --pretty false
npm run lint
npm test
npm run test:e2e
npm run test:webview
npm run compile
git add .
git commit -m "<message>"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
gh run list --workflow publish.yml --limit 5
gh run watch <run-id> --exit-status
```

Keep `package.json` and `package-lock.json` versions in sync.

## Known Issues And Follow-ups

- `.github/workflows/publish.yml` currently uses Node.js 20 in `actions/setup-node@v4`. GitHub Actions warns that Node.js 20 actions are deprecated and will move toward Node.js 24. Update this workflow before it becomes a release blocker.
- Existing old local VSIX files such as `taskpilot-0.3.3-test-*.vsix` are not part of a normal release workflow.
- `CLAUDE.md` is currently minimal. Treat `AGENTS.md` as the more complete development entrypoint.
