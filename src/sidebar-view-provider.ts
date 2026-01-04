/**
 * SidebarViewProvider
 * サイドバーにWebview UIを表示するProvider
 */

import * as vscode from 'vscode';
import { MenuItem, MenuConfig } from './types';
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

        // アクション実行
        const resolvedAction = this._resolveAction(item, config);
        if (resolvedAction) {
            await this._actionExecutor.execute(resolvedAction);
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
     * アクションを解決する
     */
    private _resolveAction(item: MenuItem, config: MenuConfig) {
        if (item.ref && config.commands) {
            const command = config.commands[item.ref];
            if (command) {
                return {
                    type: command.type,
                    command: command.command,
                    terminal: command.terminal,
                    args: command.args,
                    cwd: command.cwd
                };
            }
        }

        if (item.type && item.command) {
            return {
                type: item.type,
                command: item.command,
                terminal: item.terminal,
                args: item.args,
                cwd: item.cwd
            };
        }

        return null;
    }

    /**
     * WebviewのHTMLを生成
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const config = this._configManager.getConfig();
        const menuHtml = config ? this.getMenuItemsHtml(config.menu) : this._getEmptyStateHtml();

        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
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
            <p>No menu items configured.</p>
            <p>設定ファイル (.vscode/task-menu.yaml) を作成してください。</p>
        </div>`;
    }

    /**
     * アイコンをフォーマット
     */
    private _formatIcon(icon: string): string {
        // Codicon形式の場合はそのまま返す（WebviewではCodiconは使えないので絵文字に変換）
        const codiconMap: Record<string, string> = {
            '$(folder)': '📁',
            '$(terminal)': '💻',
            '$(tools)': '🔧',
            '$(package)': '📦',
            '$(beaker)': '🧪',
            '$(checklist)': '✅',
            '$(git-branch)': '🌿',
            '$(cloud-download)': '⬇️',
            '$(cloud-upload)': '⬆️',
            '$(info)': 'ℹ️',
            '$(gear)': '⚙️',
            '$(run)': '▶️',
            '$(debug)': '🐛',
            '$(file)': '📄',
            '$(search)': '🔍',
            '$(add)': '➕',
            '$(trash)': '🗑️',
            '$(edit)': '✏️',
            '$(refresh)': '🔄'
        };

        return codiconMap[icon] || icon;
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
