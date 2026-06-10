# Changelog

All notable changes to the "TaskPilot" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
