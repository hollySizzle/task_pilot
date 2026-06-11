# Changelog

All notable changes to the "TaskPilot" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **The user-level `task-menu.yaml` layer introduced in 0.7.0 (#11467) was removed.** `taskPilot.globalMenu` (User settings) is now the single global menu layer (priority: workspace menu > `taskPilot.globalMenu`). Rationale: the file lived on the extension host, so Remote-SSH / Dev Container sessions resolved it per host instead of sharing one menu, and it was not covered by Settings Sync — `taskPilot.globalMenu` has neither problem. A leftover `task-menu.yaml` in the VS Code User directory is ignored. (#11597)
- `TaskPilot: Export Workspace Menu to Global Menu (User Settings)` (formerly "…to User task-menu.yaml") now shows a multi-select QuickPick of the exportable top-level items and writes the selection directly into `taskPilot.globalMenu` — same-label items are replaced, new labels appended. The clipboard JSON step is gone, and the command still never touches `taskPilot.configPath` or the file system. (#11597)

### Added
- Right-click a sidebar menu item to **Promote to Global Menu** (writes the single item into `taskPilot.globalMenu`, replacing a same-label entry) or **Remove from Global Menu** (top-level global items only). Items containing `ref` cannot be promoted. (#11597)

## [0.7.0] - 2026-06-10

### Changed
- The User-level `task-menu.yaml` written by `TaskPilot: Export Workspace Menu to User task-menu.yaml` is now loaded as a **merged user-level menu layer** (priority: workspace menu > user-level file > `taskPilot.globalMenu`) instead of replacing the workspace menu via `taskPilot.configPath`. Exporting no longer touches `taskPilot.configPath` (a stale value pointing at the export location is cleaned up on the next export), so project-local `.vscode/task-menu.yaml` files are never hidden by an export. The export now asks before overwriting an existing User-level file. (#11467)

### Added
- The sidebar shows a persistent footer with the config file the workspace menu was actually loaded from, including fallback and load-error states; clicking it opens the file. (#11465)
- TaskPilot now activates on startup (`onStartupFinished`), so the config is loaded and the file watcher armed before the sidebar is first opened — previously the extension stayed dormant until the view was opened, which in Dev Containers looked like the extension was not installed. (#11466)

### Fixed
- The config error notification button now says "Open Config File" to match what it does; the globalMenu error button label is localized. Pasting an exported workspace config object into `taskPilot.globalMenu` now produces one targeted diagnostic instead of a pile of per-field errors. (#11468)
- `npm test` / `npm run test:e2e` silently passed without running any tests; the runners now launch the electron test build (pinned to VS Code 1.123.2), build the real webpack bundle before integration tests, and the remote-action tests no longer open real remote windows mid-suite. (#11459)

## [0.6.11] - 2026-06-10

### Fixed
- The sidebar reload button (`taskPilot.refreshSidebar`) now actually reloads `task-menu.yaml` instead of only re-rendering the sidebar from the previously loaded configuration. Edits are reflected immediately on button press, without waiting for the file watcher to fire (which is noticeably delayed in Dev Container / remote windows). (#11461)

## [0.6.10] - 2026-06-10

### Fixed
- Fixed an unreachable absolute `taskPilot.configPath` (e.g. the User-level path written by `taskPilot.exportGlobalMenu` in v0.6.9) hiding the workspace-local `.vscode/task-menu.yaml` in Dev Container / remote workspaces: when the configured absolute path is not readable from the current workspace and `.vscode/task-menu.yaml` exists, TaskPilot now falls back to the workspace default. A readable custom absolute `configPath` remains preferred as before, relative `configPath` behavior is unchanged, and when no fallback exists the missing configured path is reported as before. Config-change events now carry the effective path and the fallback reason for diagnostics. (#11436, #11437)

## [0.6.9] - 2026-06-10

### Changed
- `TaskPilot: Export Workspace Menu to User task-menu.yaml` (`taskPilot.exportGlobalMenu`) now writes the exported workspace menu to a User-level `task-menu.yaml` in the VS Code User directory and sets `taskPilot.configPath` to that file's absolute path in User settings, so sharing a menu across workspaces no longer requires hand-editing VS Code User settings. The success notification opens the `taskPilot.configPath` setting; the legacy `taskPilot.globalMenu` setting is offered only when an existing same-label entry would overlap. The `globalMenu` JSON is still copied to the clipboard for migration, and top-level items containing `ref` remain skipped with a notification. (#11409)

### Internal
- Synced the redmine-governed agent scaffold to preset `2026.06.02.1` (developer governance tooling only; no user-facing behavior change). (#10766)

## [0.6.8] - 2026-05-31

### Fixed
- Fixed long terminal commands still being truncated near the ~1024-byte boundary: the real cause is the Unix tty canonical input-line limit (`MAX_CANON`/`MAX_INPUT` = 1024 bytes), which chunking/timing cannot avoid. On macOS/Linux, long commands (>1000 bytes) are now written to a dedicated private temp directory (`mkdtemp`, 0700, exclusive `wx` create) and executed via a short `source '<file>'; rm -rf '<dir>'` line, so the full command—including multibyte (e.g. Japanese) characters—is sent intact regardless of length. Short commands are still sent directly, and Windows falls back to the existing chunked send. (#10831)

## [0.6.7] - 2026-05-31

### Fixed
- Fixed long terminal command input being truncated at the ~1024-byte transport boundary by chunking command text into UTF-8 byte-bounded segments (`sendText(chunk, false)`) with a final Enter, so long commands including multibyte (e.g. Japanese) characters are sent intact (#10817)

## [0.6.6] - 2026-05-14

### Changed
- Changed `shellCommand` failure notifications to prefer concise stderr/stdout output instead of dumping the full raw command string

### Fixed
- Fixed shell-command failure messaging so validation-style checks can report actionable reasons such as missing tmux sessions or insufficient existing windows

## [0.6.5] - 2026-05-14

### Added
- Added `taskPilot.globalMenu` as a documented user-settings menu surface that supports inline `MenuItem` shapes such as `children`, `actions`, `parallel`, `args`, and `continueOnError`
- Added explicit `taskPilot.exportGlobalMenu` command to copy exportable workspace menu items as JSON for `taskPilot.globalMenu`
- Added Config Editor toolbar action for exporting global menu JSON

### Changed
- Changed global menu validation to reject `ref` consistently because user settings do not provide a `commands` section
- Changed the settings schema for `taskPilot.globalMenu` to match runtime validation more closely
- Changed menu merge behavior so colliding workspace and global categories recursively merge children while keeping workspace priority
- Changed Config Editor export flow to use the editor's current state when exporting from the editor UI

### Documentation
- Documented global menu constraints, one-way export behavior, and collision rules

## [0.1.0] - 2026-01-04

### Added
- Initial release (Phase 1 MVP)
- Quick Pick UI for hierarchical task menu
- YAML configuration file support (`.vscode/task-menu.yaml`)
- Terminal command execution with named terminals
- VS Code command execution with arguments
- Task execution (tasks.json integration)
- Command reuse via `ref` references
- Configurable config file path (`taskPilot.configPath`)
- Auto-reload on configuration file changes
- Keyboard shortcut (Cmd+Shift+T / Ctrl+Shift+T)
- YAML validation with error reporting
