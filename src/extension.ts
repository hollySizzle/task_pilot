import * as vscode from 'vscode';
import { ConfigManager } from './config-manager';

let configManager: ConfigManager | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('TaskPilot extension is now active');

    // Initialize ConfigManager
    configManager = new ConfigManager();
    context.subscriptions.push(configManager);

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

    // Register showMenu command
    const showMenuCommand = vscode.commands.registerCommand('taskPilot.showMenu', async () => {
        if (!configManager) {
            vscode.window.showErrorMessage('TaskPilot: Extension not initialized');
            return;
        }

        const config = configManager.getConfig();
        if (!config) {
            const configPath = configManager.getConfigPath();
            vscode.window.showWarningMessage(
                `TaskPilot: No configuration found. Create ${configPath || '.vscode/task-menu.yaml'} to get started.`
            );
            return;
        }

        vscode.window.showInformationMessage(`TaskPilot: Loaded config v${config.version} with ${config.menu.length} menu items`);
    });

    context.subscriptions.push(showMenuCommand);
}

export function deactivate() {
    configManager = undefined;
}
