# TaskPilot

Hierarchical task menu for VS Code - execute terminal commands, VS Code commands, and tasks from YAML configuration.

## Features

- **Hierarchical Menu**: Organize commands in a tree structure with unlimited depth
- **Quick Pick UI**: Fast keyboard-driven interface
- **Multiple Action Types**:
  - Terminal commands (with named terminals)
  - VS Code commands (with arguments)
  - tasks.json tasks
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

### YAML Schema

```yaml
version: "1.0"

# Reusable command definitions
commands:
  command_id:
    type: terminal | vscodeCommand | task
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
    type: terminal | vscodeCommand | task
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
