/**
 * SidebarViewProvider
 * サイドバーにWebview UIを表示するProvider
 */

import * as vscode from 'vscode';
import { MenuItem } from './types';
import { ConfigManager } from './config-manager';
import { ActionExecutor } from './action-executor';

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
    private _showDescriptions: boolean = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _configManager: ConfigManager,
        private readonly _actionExecutor: ActionExecutor
    ) {}

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
                    this.refresh();
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
            vscode.window.showErrorMessage('TaskPilot: 設定が読み込まれていません');
            return;
        }

        const item = this._findItemByPath(config.menu, path.split('.'));
        if (!item) {
            vscode.window.showErrorMessage('TaskPilot: メニューアイテムが見つかりません');
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
                        `TaskPilot: ${terminals.length}個の並列ターミナルを起動しました`
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
            vscode.window.showErrorMessage('TaskPilot: 実行可能なアクションがありません');
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
                    vscode.window.showWarningMessage(`TaskPilot: 実行がキャンセルされました (${result.completedCount}/${result.totalCount} 完了)`);
                } else if (!result.success) {
                    if (result.error) {
                        vscode.window.showErrorMessage(`TaskPilot: ${result.error.message} (ステップ ${(result.failedIndex ?? 0) + 1})`);
                    } else if (result.errors && result.errors.length > 0) {
                        vscode.window.showWarningMessage(`TaskPilot: ${result.errors.length}件のエラーで完了`);
                    }
                } else {
                    vscode.window.showInformationMessage(`TaskPilot: 全${result.totalCount}アクション完了`);
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
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 0;
            margin: 0;
        }

        .menu-container {
            padding: 8px 0;
        }

        .menu-item {
            display: flex;
            align-items: flex-start;
            padding: 3px 8px 3px 12px;
            cursor: pointer;
            user-select: none;
            min-height: 22px;
        }

        .menu-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .menu-item.category {
            font-weight: 600;
        }

        .menu-item .icon {
            margin-right: 6px;
            width: 16px;
            height: 22px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .menu-item .chevron {
            margin-right: 2px;
            width: 16px;
            height: 22px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            opacity: 0.8;
        }

        .menu-item .label-container {
            flex: 1;
            min-width: 0;
        }

        .menu-item .label {
            line-height: 22px;
        }

        .menu-item .description {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            opacity: 0.8;
            line-height: 1.3;
            margin-top: 1px;
            word-break: break-word;
        }

        .menu-item .run-btn {
            opacity: 0;
            padding: 2px 6px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }

        .menu-item:hover .run-btn {
            opacity: 1;
        }

        .menu-item .run-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .children {
            display: none;
        }

        .children.expanded {
            display: block;
        }

        .children .menu-item {
            padding-left: 24px;
            position: relative;
        }

        .children .menu-item::before {
            content: '';
            position: absolute;
            left: 16px;
            top: 0;
            bottom: 0;
            width: 1px;
            background: var(--vscode-tree-indentGuidesStroke, rgba(128, 128, 128, 0.3));
        }

        .children .children .menu-item {
            padding-left: 40px;
        }

        .children .children .menu-item::before {
            left: 16px;
        }

        .children .children .menu-item::after {
            content: '';
            position: absolute;
            left: 32px;
            top: 0;
            bottom: 0;
            width: 1px;
            background: var(--vscode-tree-indentGuidesStroke, rgba(128, 128, 128, 0.3));
        }

        /* description toggle button */
        .description-toggle {
            padding: 4px 8px;
            margin: 4px 8px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            background: transparent;
            border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
            border-radius: 3px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .description-toggle:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .description-toggle .codicon {
            font-size: 12px;
        }

        .empty-state {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state .empty-hint {
            font-size: 12px;
            margin-bottom: 12px;
        }

        .empty-state .generate-btn {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }

        .empty-state .generate-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .empty-state a {
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="menu-container">
        ${menuHtml}
    </div>
    <script>
        const vscode = acquireVsCodeApi();

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
    </script>
</body>
</html>`;
    }

    /**
     * メニューとdescriptionトグルボタンのHTMLを生成
     */
    private _getMenuWithToggleHtml(items: MenuItem[]): string {
        const toggleIcon = this._showDescriptions ? 'codicon-eye' : 'codicon-eye-closed';
        const toggleLabel = this._showDescriptions ? '説明を隠す' : '説明を表示';

        let html = `<button class="description-toggle" onclick="toggleDescriptions()">
            <i class="codicon ${toggleIcon}"></i>
            <span>${toggleLabel}</span>
        </button>`;

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

        return items.map((item, index) => {
            const path = prefix ? `${prefix}.${index}` : `${index}`;
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = this._expandedItems.has(path);
            const icon = item.icon || (hasChildren ? '$(folder)' : '$(terminal)');

            let html = `<div class="menu-item ${hasChildren ? 'category' : ''}" onclick="${hasChildren ? `toggle('${path}')` : `execute('${path}')`}">`;

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
            <p>設定ファイルがありません</p>
            <p class="empty-hint">サンプルから始めましょう</p>
            <button class="generate-btn" onclick="generateSample()">サンプル設定を生成</button>
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
