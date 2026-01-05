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
        const menuHtml = config ? this.getMenuItemsHtml(config.menu) : this._getEmptyStateHtml();

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
            align-items: center;
            padding: 6px 12px;
            cursor: pointer;
            user-select: none;
        }

        .menu-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .menu-item.category {
            font-weight: 600;
        }

        .menu-item .icon {
            margin-right: 8px;
            width: 16px;
            text-align: center;
        }

        .menu-item .chevron {
            margin-right: 4px;
            width: 16px;
            text-align: center;
            font-size: 10px;
        }

        .menu-item .label {
            flex: 1;
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
            padding-left: 28px;
        }

        .children .children .menu-item {
            padding-left: 44px;
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
    </script>
</body>
</html>`;
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
                html += `<span class="chevron">${isExpanded ? '▼' : '▶'}</span>`;
            }

            html += `<span class="icon">${this._formatIcon(icon)}</span>`;
            html += `<span class="label">${this._escapeHtml(item.label)}</span>`;

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
