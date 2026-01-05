/**
 * TaskPilot Extension
 * 階層型タスクメニューを提供するVS Code拡張機能
 */

import * as vscode from 'vscode';
import { ConfigManager } from './config-manager';
import { ActionExecutor } from './action-executor';
import { QuickPickMenu } from './quick-pick-menu';
import { SidebarViewProvider } from './sidebar-view-provider';
import { ConfigEditorPanel } from './config-editor-panel';
import { generateSampleConfig } from './sample-generator';

/** ConfigManager インスタンス */
let configManager: ConfigManager | undefined;

/** ActionExecutor インスタンス */
let actionExecutor: ActionExecutor | undefined;

/** SidebarViewProvider インスタンス */
let sidebarProvider: SidebarViewProvider | undefined;

/**
 * 拡張機能のアクティベート
 */
export function activate(context: vscode.ExtensionContext): void {
    console.log('TaskPilot extension is now active');

    // Initialize ConfigManager
    configManager = new ConfigManager();
    context.subscriptions.push(configManager);

    // Initialize ActionExecutor
    actionExecutor = new ActionExecutor();
    context.subscriptions.push(actionExecutor);

    // Listen for config changes
    configManager.onConfigChanged(event => {
        if (event.error) {
            console.error('TaskPilot config error:', event.error.message);
        } else if (event.config) {
            console.log('TaskPilot config loaded:', event.config.version);
        }
    });

    // Start config manager
    configManager.initialize().catch(err => {
        console.error('Failed to initialize ConfigManager:', err);
    });

    // Initialize SidebarViewProvider
    sidebarProvider = new SidebarViewProvider(
        context.extensionUri,
        configManager,
        actionExecutor
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SidebarViewProvider.VIEW_TYPE,
            sidebarProvider
        )
    );

    // Register showMenu command
    const showMenuCommand = vscode.commands.registerCommand('taskPilot.showMenu', async () => {
        if (!configManager || !actionExecutor) {
            vscode.window.showErrorMessage('TaskPilot: Extension not initialized');
            return;
        }

        const config = configManager.getConfig();
        if (!config) {
            const configPath = configManager.getConfigPath();
            const action = await vscode.window.showWarningMessage(
                `TaskPilot: No configuration found. Create ${configPath || '.vscode/task-menu.yaml'} to get started.`,
                'Create Sample'
            );

            if (action === 'Create Sample') {
                await createSampleConfig(configPath);
            }
            return;
        }

        // Show the menu
        await QuickPickMenu.show(configManager, actionExecutor);
    });

    context.subscriptions.push(showMenuCommand);

    // Register reload command
    const reloadCommand = vscode.commands.registerCommand('taskPilot.reloadConfig', async () => {
        if (configManager) {
            await configManager.reloadConfig();
            vscode.window.showInformationMessage('TaskPilot: Configuration reloaded');
        }
    });

    context.subscriptions.push(reloadCommand);

    // Register refreshSidebar command
    const refreshSidebarCommand = vscode.commands.registerCommand('taskPilot.refreshSidebar', () => {
        if (sidebarProvider) {
            sidebarProvider.refresh();
        }
    });

    context.subscriptions.push(refreshSidebarCommand);

    // Register openEditor command
    const openEditorCommand = vscode.commands.registerCommand('taskPilot.openEditor', () => {
        if (!configManager) {
            vscode.window.showErrorMessage('TaskPilot: Extension not initialized');
            return;
        }

        ConfigEditorPanel.createOrShow(context.extensionUri, configManager);
    });

    context.subscriptions.push(openEditorCommand);

    // Register generateSample command
    const generateSampleCommand = vscode.commands.registerCommand('taskPilot.generateSample', async () => {
        if (!configManager) {
            vscode.window.showErrorMessage('TaskPilot: Extension not initialized');
            return;
        }

        const configPath = configManager.getConfigPath();
        if (!configPath) {
            vscode.window.showErrorMessage('TaskPilot: ワークスペースフォルダが開かれていません');
            return;
        }

        await generateSampleConfig(configPath);
    });

    context.subscriptions.push(generateSampleCommand);
}

/**
 * サンプル設定ファイルを作成
 */
async function createSampleConfig(configPath: string | null): Promise<void> {
    if (!configPath) {
        vscode.window.showErrorMessage('TaskPilot: Cannot create config file - no workspace folder open');
        return;
    }

    const sampleConfig = `# TaskPilot Configuration
version: "1.0"

# Reusable command definitions
commands:
  build:
    type: terminal
    command: npm run build
    description: Build the project
  test:
    type: terminal
    command: npm test
    description: Run tests
  lint:
    type: terminal
    command: npm run lint
    description: Run linter

# Menu structure
menu:
  - label: Development
    icon: "$(tools)"
    children:
      - label: Build
        icon: "$(package)"
        ref: build
      - label: Test
        icon: "$(beaker)"
        ref: test
      - label: Lint
        icon: "$(checklist)"
        ref: lint

  - label: Git
    icon: "$(git-branch)"
    children:
      - label: Pull
        icon: "$(cloud-download)"
        type: terminal
        command: git pull
      - label: Push
        icon: "$(cloud-upload)"
        type: terminal
        command: git push
      - label: Status
        icon: "$(info)"
        type: terminal
        command: git status

  - label: Open Settings
    icon: "$(gear)"
    type: vscodeCommand
    command: workbench.action.openSettings
`;

    try {
        const uri = vscode.Uri.file(configPath);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(sampleConfig, 'utf-8'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage('TaskPilot: Sample configuration created');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`TaskPilot: Failed to create config file: ${message}`);
    }
}

/**
 * 拡張機能のディアクティベート
 */
export function deactivate(): void {
    configManager = undefined;
    actionExecutor = undefined;
    sidebarProvider = undefined;
}
