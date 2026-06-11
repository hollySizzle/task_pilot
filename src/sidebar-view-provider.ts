/**
 * SidebarViewProvider
 * サイドバーにWebview UIを表示するProvider
 */

import * as vscode from 'vscode';
import { MenuItem } from './types';
import { ConfigManager } from './config-manager';
import { ActionExecutor } from './action-executor';
import { getStyles } from './webview/styles';

/**
 * サイドバーWebviewプロバイダー
 */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
    /** View Type ID */
    public static readonly VIEW_TYPE = 'taskPilot.sidebarView';

    /** Webview View インスタンス */
    private _view?: vscode.WebviewView;

    /** 展開状態を管理 */
    private _expandedItems: Set<string> = new Set();

    /** description表示フラグ */
    private _showDescriptions: boolean = true;

    /** 状態永続化用のキー */
    private static readonly SHOW_DESCRIPTIONS_KEY = 'taskPilot.showDescriptions';

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _configManager: ConfigManager,
        private readonly _actionExecutor: ActionExecutor,
        private readonly _context?: vscode.ExtensionContext
    ) {
        // globalStateから状態を復元（デフォルトtrue）
        if (_context) {
            this._showDescriptions = _context.globalState.get(
                SidebarViewProvider.SHOW_DESCRIPTIONS_KEY,
                true
            );
        }
    }

    /**
     * WebviewViewを解決する（VS Codeから呼ばれる）
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // メッセージハンドリング
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'execute':
                    await this._executeAction(message.path);
                    break;
                case 'toggle':
                    this._toggleItem(message.path);
                    break;
                case 'refresh':
                    this.refresh();
                    break;
                case 'generateSample':
                    await vscode.commands.executeCommand('taskPilot.generateSample');
                    break;
                case 'toggleDescriptions':
                    this._showDescriptions = !this._showDescriptions;
                    // 状態を永続化
                    if (this._context) {
                        this._context.globalState.update(
                            SidebarViewProvider.SHOW_DESCRIPTIONS_KEY,
                            this._showDescriptions
                        );
                    }
                    this.refresh();
                    break;
                case 'openGlobalSettings':
                    await vscode.commands.executeCommand('taskPilot.openGlobalSettings');
                    break;
                case 'openConfigFile':
                    await this._openConfigSource();
                    break;
            }
        });

        // 設定変更時にUIを更新
        this._configManager.onConfigChanged(() => {
            this.refresh();
        });
    }

    /**
     * Webviewを更新する
     */
    public refresh(): void {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    /**
     * アイテムの展開/折りたたみを切り替える
     */
    private _toggleItem(path: string): void {
        if (this._expandedItems.has(path)) {
            this._expandedItems.delete(path);
        } else {
            this._expandedItems.add(path);
        }
        this.refresh();
    }

    /**
     * アクションを実行する
     */
    private async _executeAction(path: string): Promise<void> {
        const config = this._configManager.getConfig();
        if (!config) {
            vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('Configuration not loaded')}`);
            return;
        }

        const item = this._findItemByPath(config.menu, path.split('.'));
        if (!item) {
            vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('Menu item not found')}`);
            return;
        }

        // 子要素がある場合は展開/折りたたみ
        if (item.children && item.children.length > 0) {
            this._toggleItem(path);
            return;
        }

        // 並列アクション実行
        if (this._configManager.hasParallelActions(item)) {
            const parallelActions = this._configManager.resolveParallelActions(item);
            if (parallelActions && parallelActions.length > 0) {
                try {
                    const terminals = await this._actionExecutor.executeParallel(parallelActions);
                    vscode.window.showInformationMessage(
                        `TaskPilot: ${vscode.l10n.t('Started {0} parallel terminal(s)', terminals.length)}`
                    );
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    vscode.window.showErrorMessage(`TaskPilot: ${message}`);
                }
                return;
            }
        }

        // アクション実行（単一/複数対応）
        const actions = this._configManager.resolveActions(item);
        if (!actions || actions.length === 0) {
            vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('No executable action available')}`);
            return;
        }

        if (actions.length === 1) {
            // 単一アクション
            try {
                await this._actionExecutor.execute(actions[0]);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`TaskPilot: ${message}`);
            }
        } else {
            // 複数アクション - 進捗表示
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `TaskPilot: ${item.label}`,
                cancellable: true
            }, async (progress, token) => {
                const result = await this._actionExecutor.executeMultiple(actions, {
                    continueOnError: item.continueOnError ?? false,
                    cancellationToken: token,
                    onProgress: (current, total, action) => {
                        progress.report({
                            increment: 100 / total,
                            message: `(${current}/${total}) ${action.description || action.command}`
                        });
                    }
                });

                if (result.cancelled) {
                    vscode.window.showWarningMessage(`TaskPilot: ${vscode.l10n.t('Execution cancelled ({0}/{1} completed)', result.completedCount, result.totalCount)}`);
                } else if (!result.success) {
                    if (result.error) {
                        vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('{0} (at step {1})', result.error.message, (result.failedIndex ?? 0) + 1)}`);
                    } else if (result.errors && result.errors.length > 0) {
                        vscode.window.showWarningMessage(`TaskPilot: ${vscode.l10n.t('Completed with {0} error(s)', result.errors.length)}`);
                    }
                } else {
                    vscode.window.showInformationMessage(`TaskPilot: ${vscode.l10n.t('All {0} actions completed', result.totalCount)}`);
                }
            });
        }
    }

    /**
     * パスからメニューアイテムを検索
     */
    private _findItemByPath(items: MenuItem[], pathParts: string[]): MenuItem | null {
        if (pathParts.length === 0) {
            return null;
        }

        const index = parseInt(pathParts[0], 10);
        if (isNaN(index) || index < 0 || index >= items.length) {
            return null;
        }

        const item = items[index];

        if (pathParts.length === 1) {
            return item;
        }

        if (item.children) {
            return this._findItemByPath(item.children, pathParts.slice(1));
        }

        return null;
    }


    /**
     * 読込元 config を開く (#11465)。fallback 中は実際に読んだファイルを開く。
     */
    private async _openConfigSource(): Promise<void> {
        const configPath = this._configManager.getEffectiveConfigPath() ?? this._configManager.getConfigPath();
        if (!configPath) {
            return;
        }
        try {
            const doc = await vscode.workspace.openTextDocument(configPath);
            await vscode.window.showTextDocument(doc);
        } catch {
            vscode.window.showWarningMessage(
                `TaskPilot: ${vscode.l10n.t('Cannot open config file: {0}', configPath)}`
            );
        }
    }

    /**
     * 読込元 config の footer HTML を生成 (#11465)。
     *
     * 「menu が出ない / 反映されない」をユーザーが自己診断できるよう、
     * いま実際に読んでいるファイルと fallback / 未ロード状態を常時表示する。
     */
    private _getConfigSourceHtml(): string {
        const effectivePath = this._configManager.getEffectiveConfigPath();
        const configuredPath = this._configManager.getConfigPath();
        const fallbackReason = this._configManager.getFallbackReason();
        const loaded = this._configManager.getWorkspaceConfig() !== null;

        if (!effectivePath && !configuredPath) {
            const label = vscode.l10n.t('No workspace folder open');
            return `<div class="config-source disabled" title="${this._escapeHtml(label)}">
                <i class="codicon codicon-info"></i>
                <span class="config-source-path">${this._escapeHtml(label)}</span>
            </div>`;
        }

        const sourcePath = effectivePath ?? configuredPath!;
        const displayPath = vscode.workspace.asRelativePath(sourcePath);
        const openHint = vscode.l10n.t('Click to open');

        let icon = 'codicon-file-code';
        let stateClass = '';
        let tooltip = `${sourcePath}\n${openHint}`;

        if (!loaded) {
            icon = 'codicon-warning';
            stateClass = ' missing';
            tooltip = `${vscode.l10n.t('Config not loaded (missing or invalid): {0}', sourcePath)}\n${openHint}`;
        } else if (fallbackReason) {
            icon = 'codicon-arrow-swap';
            stateClass = ' fallback';
            tooltip = `${vscode.l10n.t('Fallback active: {0}', fallbackReason)}\n${openHint}`;
        }

        return `<div class="config-source${stateClass}" onclick="openConfigFile()" title="${this._escapeHtml(tooltip)}">
            <i class="codicon ${icon}"></i>
            <span class="config-source-path">${this._escapeHtml(displayPath)}</span>
        </div>`;
    }

    /**
     * WebviewのHTMLを生成
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const config = this._configManager.getConfig();
        const menuHtml = config ? this._getMenuWithToggleHtml(config.menu) : this._getEmptyStateHtml();

        // Codicon フォントのURI
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
        );

        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'unsafe-inline';">
    <link href="${codiconsUri}" rel="stylesheet" />
    <title>TaskPilot</title>
    <style>${getStyles()}</style>
</head>
<body>
    <div class="menu-container">
        ${menuHtml}
    </div>
    ${this._getConfigSourceHtml()}
    <script>
        const vscode = acquireVsCodeApi();

        function openConfigFile() {
            vscode.postMessage({ type: 'openConfigFile' });
        }

        function toggle(path) {
            vscode.postMessage({ type: 'toggle', path: path });
        }

        function execute(path) {
            vscode.postMessage({ type: 'execute', path: path });
        }

        function generateSample() {
            vscode.postMessage({ type: 'generateSample' });
        }

        function toggleDescriptions() {
            vscode.postMessage({ type: 'toggleDescriptions' });
        }

        function openGlobalSettings() {
            vscode.postMessage({ type: 'openGlobalSettings' });
        }
    </script>
</body>
</html>`;
    }

    /**
     * メニューとdescriptionトグルボタンのHTMLを生成
     */
    private _getMenuWithToggleHtml(items: MenuItem[]): string {
        const toggleIcon = this._showDescriptions ? 'codicon-eye' : 'codicon-eye-closed';
        const toggleLabel = this._showDescriptions
            ? vscode.l10n.t('Hide descriptions')
            : vscode.l10n.t('Show descriptions');
        const globalSettingsLabel = vscode.l10n.t('Open Global Settings');

        let html = `<div class="toolbar">
            <button class="description-toggle" onclick="toggleDescriptions()" title="${toggleLabel}">
                <i class="codicon ${toggleIcon}"></i>
                <span>${toggleLabel}</span>
            </button>
            <button class="global-settings-btn" onclick="openGlobalSettings()" title="${globalSettingsLabel}">
                <i class="codicon codicon-gear"></i>
            </button>
        </div>`;

        html += this.getMenuItemsHtml(items);
        return html;
    }

    /**
     * メニューアイテムのHTMLを生成
     */
    public getMenuItemsHtml(items: MenuItem[], prefix: string = ''): string {
        if (!items || items.length === 0) {
            return this._getEmptyStateHtml();
        }

        const globalLabels = new Set(
            this._configManager.getGlobalMenu().map(globalItem => globalItem.label)
        );

        return items.map((item, index) => {
            const path = prefix ? `${prefix}.${index}` : `${index}`;
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = this._expandedItems.has(path);
            const icon = item.icon || (hasChildren ? '$(folder)' : '$(terminal)');

            // 右クリック (webview/context) 用の context (#11597)。
            // taskPilotPromotable / taskPilotInGlobal は package.json の menu when 句で参照する。
            // Remove は top-level の globalMenu 項目に限る (昇格・削除とも label 単位の操作のため)。
            const contextJson = JSON.stringify({
                webviewSection: 'menuItem',
                taskPilotPath: path,
                taskPilotPromotable: !this._configManager.containsRef(item),
                taskPilotInGlobal: prefix === '' && globalLabels.has(item.label),
                preventDefaultContextMenuItems: true
            });

            let html = `<div class="menu-item ${hasChildren ? 'category' : ''}" data-vscode-context="${this._escapeHtml(contextJson)}" onclick="${hasChildren ? `toggle('${path}')` : `execute('${path}')`}">`;

            if (hasChildren) {
                const chevronIcon = isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right';
                html += `<span class="chevron"><i class="codicon ${chevronIcon}"></i></span>`;
            }

            html += `<span class="icon">${this._formatIcon(icon)}</span>`;
            html += `<span class="label-container">`;
            html += `<div class="label">${this._escapeHtml(item.label)}</div>`;

            // description表示（トグルがONの場合のみ）
            if (this._showDescriptions && item.description) {
                html += `<div class="description">${this._escapeHtml(item.description)}</div>`;
            }

            html += `</span>`;

            if (!hasChildren) {
                html += `<button class="run-btn" onclick="event.stopPropagation(); execute('${path}')">Run</button>`;
            }

            html += '</div>';

            if (hasChildren && item.children) {
                html += `<div class="children ${isExpanded ? 'expanded' : ''}">`;
                html += this.getMenuItemsHtml(item.children, path);
                html += '</div>';
            }

            return html;
        }).join('');
    }

    /**
     * 空の状態のHTMLを生成
     */
    private _getEmptyStateHtml(): string {
        return `<div class="empty-state">
            <p>${vscode.l10n.t('No configuration file')}</p>
            <p class="empty-hint">${vscode.l10n.t("Let's start with a sample")}</p>
            <button class="generate-btn" onclick="generateSample()">${vscode.l10n.t('Generate sample configuration')}</button>
        </div>`;
    }

    /**
     * アイコンをフォーマット
     * $(icon-name) 形式を <i class="codicon codicon-icon-name"></i> に変換
     */
    private _formatIcon(icon: string): string {
        // $(icon-name) 形式をcodicon HTMLに変換
        const codiconMatch = icon.match(/^\$\(([^)]+)\)$/);
        if (codiconMatch) {
            const iconName = codiconMatch[1];
            return `<i class="codicon codicon-${iconName}"></i>`;
        }

        // 絵文字などはそのまま返す
        return this._escapeHtml(icon);
    }

    /**
     * HTMLエスケープ
     */
    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
