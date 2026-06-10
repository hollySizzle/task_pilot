# TaskPilot

Hierarchical task menu for VS Code - execute terminal commands, VS Code commands, and tasks from YAML configuration.

## Features

- **Hierarchical Menu**: Organize commands in a tree structure with unlimited depth
- **Quick Pick UI**: Fast keyboard-driven interface
- **Multiple Action Types**:
  - Terminal commands (with named terminals)
  - VS Code commands (with arguments)
  - tasks.json tasks
  - Remote actions (Dev Container, SSH)
- **YAML Configuration**: Easy-to-edit configuration file
- **Command Reuse**: Define commands once, reference from multiple menus (`ref` feature)
- **Auto Reload**: Configuration changes are automatically detected

## Installation

### From Visual Studio Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "TaskPilot"
4. Click Install

### Manual Installation

1. Download the `.vsix` file from [Releases](https://github.com/hollySizzle/task_pilot/releases)
2. In VS Code, open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Run "Extensions: Install from VSIX..."
4. Select the downloaded `.vsix` file

## Quick Start

1. Create `.vscode/task-menu.yaml` in your workspace:

```yaml
version: "1.0"

menu:
  - label: Build
    icon: "$(tools)"
    type: terminal
    command: npm run build

  - label: Development
    icon: "$(rocket)"
    children:
      - label: Start Server
        icon: "$(play)"
        type: terminal
        terminal: dev
        command: npm run dev

      - label: Run Tests
        icon: "$(beaker)"
        type: terminal
        command: npm test
```

2. Press `Cmd+Shift+T` (Mac) or `Ctrl+Shift+T` (Windows/Linux)
3. Select a menu item to execute

## Configuration

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `taskPilot.configPath` | Path to YAML config file | `.vscode/task-menu.yaml` |
| `taskPilot.globalMenu` | Global menu items merged after workspace menu | `[]` |

An absolute `taskPilot.configPath` is used as-is when readable. If it is **not readable from the current workspace** — typical in Dev Container / remote workspaces where the local path does not exist — and the workspace has a `.vscode/task-menu.yaml`, TaskPilot falls back to that workspace default instead of showing no menu. A readable custom absolute path always stays preferred, and relative paths are resolved against the workspace root as before.

Menus are layered with workspace priority:

1. Workspace menu (`taskPilot.configPath`, default `.vscode/task-menu.yaml`)
2. User-level `task-menu.yaml` in the VS Code User directory (written by the export command)
3. `taskPilot.globalMenu` in user settings (legacy)

Items with the same `label` are taken from the higher-priority layer; colliding categories merge their children recursively with the same priority. The sidebar footer always shows which config file the workspace menu was loaded from.

### Global Menu

`taskPilot.globalMenu` lets you define menu items in user settings and merge them into every workspace.

- It supports the same inline action shapes as `MenuItem`, including `children`, `actions`, `parallel`, `args`, and `continueOnError`
- `ref` is not supported in `taskPilot.globalMenu` because user settings do not have a `commands` section. This is enforced at every level: top-level items, nested children, and entries inside `actions`/`parallel` arrays. The settings schema also rejects `ref` so Settings UI cannot persist invalid objects.
- When a `label` collides with a workspace menu item, TaskPilot keeps the workspace item
- If both colliding items are categories with `children`, TaskPilot recursively merges their children with workspace priority

Example:

```json
"taskPilot.globalMenu": [
  {
    "label": "Utilities",
    "children": [
      {
        "label": "Open Extensions",
        "type": "vscodeCommand",
        "command": "workbench.view.extensions"
      },
      {
        "label": "Prep + Test",
        "actions": [
          {
            "type": "shellCommand",
            "command": "./scripts/prepare.sh"
          },
          {
            "type": "terminal",
            "command": "npm test",
            "terminal": "TaskPilot Tests"
          }
        ]
      }
    ]
  }
]
```

### Export Workspace Menu to the User-level Menu

Use `TaskPilot: Export Workspace Menu to User task-menu.yaml` to share the current workspace menu across all workspaces.

- The command writes the exportable top-level items to a `task-menu.yaml` in the VS Code User directory (next to `settings.json`)
- That file is loaded in every workspace as the user-level menu layer and **merged** with each workspace menu — workspace items always win on label collisions, so a project-local `.vscode/task-menu.yaml` is never hidden
- The command does **not** change `taskPilot.configPath`; if a previous TaskPilot version set it to the export location, the stale value is cleaned up on the next export
- If the file already exists, TaskPilot asks before overwriting it
- When invoked from the Config Editor's "Export Global Menu" button, the export uses the editor's current (possibly unsaved) state
- Top-level items whose subtree contains `ref` are skipped (`ref` needs the workspace `commands` section); the skipped count is reported
- For the legacy `taskPilot.globalMenu` workflow, the exported items are still copied to the clipboard as JSON

### YAML Schema

```yaml
version: "1.0"

# Reusable command definitions
commands:
  command_id:
    type: terminal | shellCommand | vscodeCommand | task
    command: string          # Command to execute
    terminal: string         # Terminal name (for type: terminal)
    args: array              # Command arguments
    cwd: string              # Working directory
    description: string      # Description

# Menu structure
menu:
  - label: string            # Display name (required)
    icon: string             # Icon (emoji or codicon)
    description: string      # Description text
    children: []             # Sub-menu items (for categories)

    # Action (one of the following)
    ref: string              # Reference to commands section
    type: terminal | shellCommand | vscodeCommand | task
    command: string
```

### Example: Full Configuration

```yaml
version: "1.0"

commands:
  start_server:
    type: terminal
    terminal: Server
    command: npm run dev
    description: Start development server

  rebuild_container:
    type: vscodeCommand
    command: remote-containers.rebuildContainer
    description: Rebuild dev container

menu:
  - label: Development
    icon: "$(rocket)"
    children:
      - label: Start Server
        icon: "$(play)"
        ref: start_server

      - label: Run Tests
        icon: "$(beaker)"
        type: terminal
        command: npm test

  - label: Container
    icon: "$(package)"
    children:
      - label: Rebuild
        icon: "$(refresh)"
        ref: rebuild_container

  - label: Troubleshooting
    icon: "$(tools)"
    children:
      - label: Server Issues
        children:
          - label: Restart Server
            ref: start_server  # Same command, different context
```

## Commands

| Command | Description | Shortcut |
|---------|-------------|----------|
| `TaskPilot: Show Menu` | Open the task menu | Cmd+Shift+T / Ctrl+Shift+T |
| `TaskPilot: Reload Configuration` | Reload YAML config | - |

## Action Types

### Terminal

Execute commands in VS Code's integrated terminal:

```yaml
- label: Build Project
  type: terminal
  command: npm run build
  terminal: Build      # Optional: named terminal
  cwd: ./packages/app  # Optional: working directory
```

### Shell Command

Execute shell commands inside TaskPilot and wait for completion before the next action:

```yaml
- label: Prepare
  type: shellCommand
  command: ./scripts/prepare.sh
  cwd: ./packages/app  # Optional: working directory
```

### VS Code Command

Execute VS Code commands:

```yaml
- label: Format Document
  type: vscodeCommand
  command: editor.action.formatDocument

- label: Open Folder
  type: vscodeCommand
  command: vscode.openFolder
  args:
    - /path/to/folder
```

### Task

Execute tasks defined in tasks.json:

```yaml
- label: Run Build Task
  type: task
  command: build  # Task name from tasks.json
```

### Dev Container

Open a folder in Dev Container (requires Remote - Containers extension):

```yaml
- label: Open in Container
  type: openInDevContainer
  path: /home/user/project  # フルパス推奨（~は非推奨）、.devcontainerを含むディレクトリを指定
```

### Remote SSH

Open a folder via SSH (requires Remote - SSH extension):

```yaml
- label: Open Remote Project
  type: openRemoteSSH
  path: /home/user/project
  host: my-server  # Host from ~/.ssh/config
```

### Remote Tunnel

Open a folder via Remote Tunnel (requires Remote - Tunnels extension):

```yaml
- label: Connect to Win11
  type: openRemoteTunnel
  path: /home/user/project  # フルパス推奨（~は非推奨）
  tunnelName: my-tunnel  # GitHub認証済みのトンネル名
```

## Requirements

- VS Code 1.85.0 or higher
- Node.js 18.x or higher (for development)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

- [GitHub Issues](https://github.com/hollySizzle/task_pilot/issues)
