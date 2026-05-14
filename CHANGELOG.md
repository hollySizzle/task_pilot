# Changelog

All notable changes to the "TaskPilot" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
