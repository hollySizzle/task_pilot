/**
 * TaskPilot Extension
 * 階層型タスクメニューを提供するVS Code拡張機能
 */

import * as vscode from 'vscode';
import {
    ConfigManager,
    detectGlobalMenuLabelOverlap,
    findMenuItemByPath,
    mergeIntoGlobalMenu,
} from './config-manager';
import { validateGlobalMenu } from './yaml-parser';
import { ActionExecutor } from './action-executor';
import { QuickPickMenu } from './quick-pick-menu';
import { SidebarViewProvider } from './sidebar-view-provider';
import { ConfigEditorPanel } from './config-editor-panel';
import { generateSampleConfig, setExtensionPath } from './sample-generator';
import { MenuConfig, MenuItem } from './types';

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
    // 出るのを防ぐ。export 先は `taskPilot.globalMenu` (User settings) であり、
    // QuickPick で選んだ top-level 項目を label 単位で merge 書き込みする (#11597)。
    // `taskPilot.configPath` とファイルシステムには一切触れない (#11467 の回帰防止)。
    // options.force は QuickPick を skip して全 exportable 項目を書く (テスト・自動化用)。
    const exportGlobalMenuCommand = vscode.commands.registerCommand(
        'taskPilot.exportGlobalMenu',
        async (configOverride?: MenuConfig, options?: { force?: boolean }) => {
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

        const existingGlobal = readGlobalMenuSetting();
        if (existingGlobal === null) {
            return;
        }

        let selected = exportResult.menu;
        if (!options?.force) {
            const existingLabels = new Set(existingGlobal.map(item => item.label));
            const picks = exportResult.menu.map(item => ({
                label: item.label,
                description: existingLabels.has(item.label)
                    ? vscode.l10n.t('replaces the existing global item')
                    : undefined,
                detail: item.description,
                picked: true,
                item
            }));
            const chosen = await vscode.window.showQuickPick(picks, {
                canPickMany: true,
                placeHolder: vscode.l10n.t('Select menu items to export to taskPilot.globalMenu (User settings)')
            });
            if (!chosen || chosen.length === 0) {
                return;
            }
            selected = chosen.map(pick => pick.item);
        }

        const replaced = detectGlobalMenuLabelOverlap(selected, existingGlobal);
        try {
            await vscode.workspace.getConfiguration('taskPilot').update(
                'globalMenu',
                mergeIntoGlobalMenu(existingGlobal, selected),
                vscode.ConfigurationTarget.Global
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`TaskPilot: Failed to update taskPilot.globalMenu (${message})`);
            return;
        }

        const skippedMessage = exportResult.skipped.length > 0
            ? ` Skipped ${exportResult.skipped.length} top-level item(s) containing ref.`
            : '';
        const replacedMessage = replaced.length > 0
            ? ` Replaced same-label item(s): ${replaced.join(', ')}.`
            : '';

        // 通知の action 選択を command の完了条件にしない (#11459)。await すると
        // 通知が閉じられるまで command promise が解決せず、呼び出し側 (テスト・
        // 他 command からの実行) が hang する。
        const OPEN_SETTINGS = vscode.l10n.t('Open Settings');
        void vscode.window.showInformationMessage(
            `TaskPilot: Exported ${selected.length} item(s) to taskPilot.globalMenu (User settings). They are merged into every workspace (workspace items win).${replacedMessage}${skippedMessage}`,
            OPEN_SETTINGS
        ).then(action => {
            if (action === OPEN_SETTINGS) {
                void vscode.commands.executeCommand('taskPilot.openGlobalSettings');
            }
        });
    });

    context.subscriptions.push(exportGlobalMenuCommand);

    // sidebar webview の右クリック (webview/context) から1項目だけ globalMenu へ
    // 昇格する (#11597)。webview HTML 側の data-vscode-context が引数になる。
    const promoteCommand = vscode.commands.registerCommand(
        'taskPilot.promoteToGlobalMenu',
        async (ctx?: { taskPilotPath?: string }) => {
        if (!configManager || !ctx?.taskPilotPath) {
            return;
        }

        const config = configManager.getConfig();
        const item = config ? findMenuItemByPath(config.menu, ctx.taskPilotPath) : null;
        if (!item) {
            vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('Menu item not found')}`);
            return;
        }

        if (configManager.containsRef(item)) {
            vscode.window.showWarningMessage(
                `TaskPilot: ${vscode.l10n.t('"{0}" contains a ref and cannot be promoted to the global menu', item.label)}`
            );
            return;
        }

        const existingGlobal = readGlobalMenuSetting();
        if (existingGlobal === null) {
            return;
        }

        try {
            await vscode.workspace.getConfiguration('taskPilot').update(
                'globalMenu',
                mergeIntoGlobalMenu(existingGlobal, [item]),
                vscode.ConfigurationTarget.Global
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`TaskPilot: Failed to update taskPilot.globalMenu (${message})`);
            return;
        }

        vscode.window.showInformationMessage(
            `TaskPilot: ${vscode.l10n.t('Promoted "{0}" to taskPilot.globalMenu (User settings)', item.label)}`
        );
    });

    context.subscriptions.push(promoteCommand);

    // globalMenu 由来の top-level 項目を右クリックから取り除く (#11597)。
    const removeFromGlobalCommand = vscode.commands.registerCommand(
        'taskPilot.removeFromGlobalMenu',
        async (ctx?: { taskPilotPath?: string }) => {
        if (!configManager || !ctx?.taskPilotPath) {
            return;
        }

        const config = configManager.getConfig();
        const item = config ? findMenuItemByPath(config.menu, ctx.taskPilotPath) : null;
        if (!item) {
            vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('Menu item not found')}`);
            return;
        }

        const existingGlobal = readGlobalMenuSetting();
        if (existingGlobal === null) {
            return;
        }

        const next = existingGlobal.filter(globalItem => globalItem.label !== item.label);
        if (next.length === existingGlobal.length) {
            vscode.window.showInformationMessage(
                `TaskPilot: ${vscode.l10n.t('"{0}" is not in taskPilot.globalMenu (User settings)', item.label)}`
            );
            return;
        }

        try {
            await vscode.workspace.getConfiguration('taskPilot').update(
                'globalMenu',
                next,
                vscode.ConfigurationTarget.Global
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`TaskPilot: Failed to update taskPilot.globalMenu (${message})`);
            return;
        }

        vscode.window.showInformationMessage(
            `TaskPilot: ${vscode.l10n.t('Removed "{0}" from taskPilot.globalMenu (User settings)', item.label)}`
        );
    });

    context.subscriptions.push(removeFromGlobalCommand);
}

/**
 * User settings (Global scope) の `taskPilot.globalMenu` 値を読み・検証する。
 *
 * `get()` は workspace 設定なども合成した値を返すため使わない — Global へ
 * 書き戻す前提では、他 scope の値を User settings へ複製してしまう。
 * 検証エラー時は通知を出して null を返す (呼び出し側は中断する)。
 */
function readGlobalMenuSetting(): MenuItem[] | null {
    const raw = vscode.workspace.getConfiguration('taskPilot')
        .inspect<unknown>('globalMenu')?.globalValue ?? [];
    const { result, menu } = validateGlobalMenu(raw);
    if (!result.valid || !menu) {
        const openSettings = vscode.l10n.t('Open Settings');
        void vscode.window.showErrorMessage(
            `TaskPilot: ${vscode.l10n.t('Existing taskPilot.globalMenu is invalid; fix it before exporting')}`,
            openSettings
        ).then(selection => {
            if (selection === openSettings) {
                void vscode.commands.executeCommand('taskPilot.openGlobalSettings');
            }
        });
        return null;
    }
    return menu;
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
