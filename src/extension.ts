/**
 * TaskPilot Extension
 * 階層型タスクメニューを提供するVS Code拡張機能
 */

import * as vscode from 'vscode';
import {
    ConfigManager,
    resolveUserTaskMenuPath,
    buildMenuConfigExport,
    detectGlobalMenuLabelOverlap,
} from './config-manager';
import { generateYaml } from './yaml-generator';
import { ActionExecutor } from './action-executor';
import { QuickPickMenu } from './quick-pick-menu';
import { SidebarViewProvider } from './sidebar-view-provider';
import { ConfigEditorPanel } from './config-editor-panel';
import { generateSampleConfig, setExtensionPath } from './sample-generator';
import { MenuConfig } from './types';

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

    // Set extension path for sample generator (SSoT)
    setExtensionPath(context.extensionPath);

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
        actionExecutor,
        context
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
            vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('Extension not initialized')}`);
            return;
        }

        const config = configManager.getConfig();
        if (!config) {
            const configPath = configManager.getConfigPath();
            const action = await vscode.window.showWarningMessage(
                `TaskPilot: ${vscode.l10n.t('No configuration found. Create {0} to get started.', configPath || '.vscode/task-menu.yaml')}`,
                vscode.l10n.t('Create Sample')
            );

            if (action === vscode.l10n.t('Create Sample')) {
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
            vscode.window.showInformationMessage(`TaskPilot: ${vscode.l10n.t('Configuration reloaded')}`);
        }
    });

    context.subscriptions.push(reloadCommand);

    // Register refreshSidebar command
    // リロードボタンは設定ファイルの再読込を起点にする (#11461)。webview の再描画は
    // ConfigManager.onConfigChanged 購読 (sidebar-view-provider) 経由で行われるため、
    // ここで直接 refresh() は呼ばない。watcher の遅延発火を待たずに即時反映される。
    const refreshSidebarCommand = vscode.commands.registerCommand('taskPilot.refreshSidebar', async () => {
        if (configManager) {
            await configManager.reloadConfig();
        } else if (sidebarProvider) {
            sidebarProvider.refresh();
        }
    });

    context.subscriptions.push(refreshSidebarCommand);

    // Register openEditor command
    const openEditorCommand = vscode.commands.registerCommand('taskPilot.openEditor', () => {
        if (!configManager) {
            vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('Extension not initialized')}`);
            return;
        }

        ConfigEditorPanel.createOrShow(context.extensionUri, configManager);
    });

    context.subscriptions.push(openEditorCommand);

    // Register generateSample command
    const generateSampleCommand = vscode.commands.registerCommand('taskPilot.generateSample', async () => {
        if (!configManager) {
            vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('Extension not initialized')}`);
            return;
        }

        const configPath = configManager.getConfigPath();
        if (!configPath) {
            vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('No workspace folder open')}`);
            return;
        }

        await generateSampleConfig(configPath);
    });

    context.subscriptions.push(generateSampleCommand);

    // Register openGlobalSettings command
    const openGlobalSettingsCommand = vscode.commands.registerCommand('taskPilot.openGlobalSettings', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:hollySizzle.taskpilot taskPilot.globalMenu');
    });

    context.subscriptions.push(openGlobalSettingsCommand);

    // Register exportGlobalMenu command
    // configOverride を渡すと、保存済み workspace YAML ではなくその config を export 元にする。
    // Config Editor は未保存編集を含む `_currentConfig` を渡すことで、stale な export が
    // 出るのを防ぐ。export は User-level `task-menu.yaml` を書き出し、`taskPilot.configPath`
    // を実絶対パスで User 設定に固定して、共有メニューの手動設定を不要にする。
    const exportGlobalMenuCommand = vscode.commands.registerCommand('taskPilot.exportGlobalMenu', async (configOverride?: MenuConfig) => {
        if (!configManager) {
            vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('Extension not initialized')}`);
            return;
        }

        const sourceConfig = configOverride ?? configManager.getWorkspaceConfig();
        if (!sourceConfig || sourceConfig.menu.length === 0) {
            vscode.window.showWarningMessage('TaskPilot: No workspace menu available to export');
            return;
        }

        const exportResult = configManager.buildGlobalMenuExport(sourceConfig);
        if (exportResult.menu.length === 0) {
            const skippedLabels = exportResult.skipped.map(item => item.label).join(', ');
            vscode.window.showWarningMessage(
                skippedLabels
                    ? `TaskPilot: No exportable menu items. Skipped: ${skippedLabels}`
                    : 'TaskPilot: No exportable menu items'
            );
            return;
        }

        // User-level task-menu.yaml を生成し、configPath(Global) を実絶対パスで設定する。
        const userYamlPath = resolveUserTaskMenuPath(context.globalStorageUri.fsPath);
        const yaml = generateYaml(buildMenuConfigExport(exportResult.menu));
        const fileUri = vscode.Uri.file(userYamlPath);

        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(fileUri, '..'));
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(yaml, 'utf8'));
            await vscode.workspace
                .getConfiguration('taskPilot')
                .update('configPath', userYamlPath, vscode.ConfigurationTarget.Global);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(
                `TaskPilot: Failed to write User-level task-menu.yaml or update configPath (${message})`
            );
            return;
        }

        // 移行期の手動 paste 用に、従来どおり globalMenu JSON も clipboard へ残す。
        await vscode.env.clipboard.writeText(JSON.stringify(exportResult.menu, null, 2));

        const overlap = detectGlobalMenuLabelOverlap(exportResult.menu, configManager.getGlobalMenu());
        const skippedMessage = exportResult.skipped.length > 0
            ? ` Skipped ${exportResult.skipped.length} top-level item(s) containing ref.`
            : '';
        const overlapMessage = overlap.length > 0
            ? ` Existing taskPilot.globalMenu has same-label item(s) [${overlap.join(', ')}] that may duplicate/shadow this menu; remove or rename them.`
            : '';

        // Default success action points at the setting we just changed
        // (taskPilot.configPath). Offer the legacy globalMenu surface only when
        // there is overlap to clean up, so users are not steered back to the
        // deprecated migration workflow (Redmine #11410 review #54647).
        const OPEN_CONFIG_PATH = 'Open Config Path Setting';
        const OPEN_GLOBAL_MENU = 'Open globalMenu';
        const actions = overlap.length > 0
            ? [OPEN_CONFIG_PATH, OPEN_GLOBAL_MENU]
            : [OPEN_CONFIG_PATH];

        // 通知の action 選択を command の完了条件にしない (#11459)。await すると
        // 通知が閉じられるまで command promise が解決せず、呼び出し側 (テスト・
        // 他 command からの実行) が hang する。
        void vscode.window.showInformationMessage(
            `TaskPilot: Wrote ${userYamlPath} and set taskPilot.configPath (User settings).${skippedMessage}${overlapMessage}`,
            ...actions
        ).then(action => {
            if (action === OPEN_CONFIG_PATH) {
                void vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    '@ext:hollySizzle.taskpilot taskPilot.configPath'
                );
            } else if (action === OPEN_GLOBAL_MENU) {
                void vscode.commands.executeCommand('taskPilot.openGlobalSettings');
            }
        });
    });

    context.subscriptions.push(exportGlobalMenuCommand);
}

/**
 * サンプル設定ファイルを作成
 */
async function createSampleConfig(configPath: string | null): Promise<void> {
    if (!configPath) {
        vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('Cannot create config file - no workspace folder open')}`);
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
        vscode.window.showInformationMessage(`TaskPilot: ${vscode.l10n.t('Sample configuration created')}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('Failed to create config file: {0}', message)}`);
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
