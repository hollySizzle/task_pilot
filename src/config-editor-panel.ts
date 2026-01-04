/**
 * TaskPilot Config Editor Panel
 * 設定ファイルをGUIで編集するWebviewパネル
 */

import * as vscode from 'vscode';
import { MenuConfig, MenuItem, CommandDefinition } from './types';
import { ConfigManager } from './config-manager';
import { ConfigEditor } from './config-editor';
import { generateYaml } from './yaml-generator';

/**
 * Webviewとのメッセージ型
 */
interface WebviewMessage {
    type: 'addItem' | 'updateItem' | 'deleteItem' | 'moveItem' |
          'addCommand' | 'updateCommand' | 'deleteCommand' |
          'save' | 'undo' | 'redo' | 'refresh' | 'ready';
    path?: number[];
    targetPath?: number[];
    item?: MenuItem;
    commandName?: string;
    command?: CommandDefinition;
    newName?: string;
}

/**
 * ConfigEditorPanel - 設定エディタWebviewパネル
 */
export class ConfigEditorPanel {
    public static readonly VIEW_TYPE = 'taskPilot.configEditor';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _configManager: ConfigManager;
    private readonly _editor: ConfigEditor;
    private _currentConfig: MenuConfig | null = null;
    private _disposables: vscode.Disposable[] = [];

    private static _currentPanel: ConfigEditorPanel | undefined;

    /**
     * パネルを表示または作成
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        configManager: ConfigManager
    ): ConfigEditorPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // 既存のパネルがあれば表示
        if (ConfigEditorPanel._currentPanel) {
            ConfigEditorPanel._currentPanel._panel.reveal(column);
            return ConfigEditorPanel._currentPanel;
        }

        // 新しいパネルを作成
        const panel = vscode.window.createWebviewPanel(
            ConfigEditorPanel.VIEW_TYPE,
            'TaskPilot Config Editor',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        ConfigEditorPanel._currentPanel = new ConfigEditorPanel(
            panel,
            extensionUri,
            configManager
        );

        return ConfigEditorPanel._currentPanel;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        configManager: ConfigManager
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._configManager = configManager;
        this._editor = new ConfigEditor();

        // 現在の設定を取得
        this._currentConfig = this._configManager.getConfig();

        // HTMLを設定
        this._update();

        // パネルが閉じられたときのクリーンアップ
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Webviewからのメッセージを処理
        this._panel.webview.onDidReceiveMessage(
            (message: WebviewMessage) => this._handleMessage(message),
            null,
            this._disposables
        );

        // 設定変更を監視
        this._configManager.onConfigChanged((event) => {
            if (event.config) {
                this._currentConfig = event.config;
                this._sendConfigToWebview();
            }
        }, null, this._disposables);
    }

    /**
     * Webviewメッセージを処理
     */
    private async _handleMessage(message: WebviewMessage): Promise<void> {
        if (!this._currentConfig && message.type !== 'ready') {
            return;
        }

        switch (message.type) {
            case 'ready':
                this._sendConfigToWebview();
                break;

            case 'addItem':
                if (message.item) {
                    this._editor.pushHistory(this._currentConfig!);
                    this._currentConfig = this._editor.addMenuItem(
                        this._currentConfig!,
                        message.item,
                        message.path
                    );
                    this._sendConfigToWebview();
                }
                break;

            case 'updateItem':
                if (message.path && message.item) {
                    this._editor.pushHistory(this._currentConfig!);
                    this._currentConfig = this._editor.updateMenuItem(
                        this._currentConfig!,
                        message.path,
                        message.item
                    );
                    this._sendConfigToWebview();
                }
                break;

            case 'deleteItem':
                if (message.path) {
                    this._editor.pushHistory(this._currentConfig!);
                    this._currentConfig = this._editor.deleteMenuItem(
                        this._currentConfig!,
                        message.path
                    );
                    this._sendConfigToWebview();
                }
                break;

            case 'moveItem':
                if (message.path && message.targetPath) {
                    this._editor.pushHistory(this._currentConfig!);
                    this._currentConfig = this._editor.moveMenuItem(
                        this._currentConfig!,
                        message.path,
                        message.targetPath
                    );
                    this._sendConfigToWebview();
                }
                break;

            case 'addCommand':
                if (message.commandName && message.command) {
                    this._editor.pushHistory(this._currentConfig!);
                    this._currentConfig = this._editor.addCommand(
                        this._currentConfig!,
                        message.commandName,
                        message.command
                    );
                    this._sendConfigToWebview();
                }
                break;

            case 'updateCommand':
                if (message.commandName && message.command) {
                    this._editor.pushHistory(this._currentConfig!);
                    this._currentConfig = this._editor.updateCommand(
                        this._currentConfig!,
                        message.commandName,
                        message.command
                    );
                    this._sendConfigToWebview();
                }
                break;

            case 'deleteCommand':
                if (message.commandName) {
                    this._editor.pushHistory(this._currentConfig!);
                    this._currentConfig = this._editor.deleteCommand(
                        this._currentConfig!,
                        message.commandName
                    );
                    this._sendConfigToWebview();
                }
                break;

            case 'save':
                await this._saveConfig();
                break;

            case 'undo':
                const undone = this._editor.undo();
                if (undone) {
                    this._editor.pushRedo(this._currentConfig!);
                    this._currentConfig = undone;
                    this._sendConfigToWebview();
                }
                break;

            case 'redo':
                const redone = this._editor.redo();
                if (redone) {
                    this._editor.pushHistory(this._currentConfig!);
                    this._currentConfig = redone;
                    this._sendConfigToWebview();
                }
                break;

            case 'refresh':
                await this._configManager.reloadConfig();
                this._currentConfig = this._configManager.getConfig();
                this._sendConfigToWebview();
                break;
        }
    }

    /**
     * 設定をWebviewに送信
     */
    private _sendConfigToWebview(): void {
        this._panel.webview.postMessage({
            type: 'config',
            config: this._currentConfig,
            canUndo: this._editor.canUndo(),
            canRedo: this._editor.canRedo()
        });
    }

    /**
     * 設定を保存
     */
    private async _saveConfig(): Promise<void> {
        if (!this._currentConfig) {
            vscode.window.showErrorMessage('TaskPilot: 保存する設定がありません');
            return;
        }

        const configPath = this._configManager.getConfigPath();
        if (!configPath) {
            vscode.window.showErrorMessage('TaskPilot: 設定ファイルのパスが見つかりません');
            return;
        }

        try {
            const yamlContent = generateYaml(this._currentConfig);
            const uri = vscode.Uri.file(configPath);
            await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(yamlContent));
            vscode.window.showInformationMessage('TaskPilot: 設定を保存しました');
            this._editor.clearHistory();
            this._sendConfigToWebview();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`TaskPilot: 保存に失敗しました: ${message}`);
        }
    }

    /**
     * Webviewを更新
     */
    private _update(): void {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    /**
     * WebviewのHTMLを生成
     */
    private _getHtmlForWebview(): string {
        const webview = this._panel.webview;

        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>TaskPilot Config Editor</title>
    <style>
        * {
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px;
            margin: 0;
        }

        .toolbar {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
            padding: 8px;
            background: var(--vscode-toolbar-background);
            border-radius: 4px;
        }

        .toolbar button {
            padding: 6px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .toolbar button:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground);
        }

        .toolbar button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .toolbar button.primary {
            background: var(--vscode-button-background);
        }

        .toolbar button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .section {
            margin-bottom: 24px;
        }

        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .section-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .menu-tree {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            background: var(--vscode-editor-background);
        }

        .menu-item {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            cursor: grab;
        }

        .menu-item:last-child {
            border-bottom: none;
        }

        .menu-item:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .menu-item.dragging {
            opacity: 0.5;
        }

        .menu-item.drag-over {
            border-top: 2px solid var(--vscode-focusBorder);
        }

        .menu-item .drag-handle {
            margin-right: 8px;
            color: var(--vscode-descriptionForeground);
            cursor: grab;
        }

        .menu-item .icon {
            margin-right: 8px;
            width: 20px;
            text-align: center;
        }

        .menu-item .label {
            flex: 1;
            font-weight: 500;
        }

        .menu-item .type-badge {
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            margin-right: 8px;
        }

        .menu-item .actions {
            display: flex;
            gap: 4px;
            opacity: 0;
        }

        .menu-item:hover .actions {
            opacity: 1;
        }

        .menu-item .actions button {
            padding: 4px 8px;
            font-size: 11px;
            background: transparent;
            border: 1px solid var(--vscode-button-border, transparent);
            color: var(--vscode-foreground);
            border-radius: 3px;
            cursor: pointer;
        }

        .menu-item .actions button:hover {
            background: var(--vscode-button-secondaryBackground);
        }

        .menu-item .actions button.delete:hover {
            background: var(--vscode-errorForeground);
            color: white;
        }

        .children {
            padding-left: 24px;
        }

        .empty-state {
            padding: 40px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }

        .modal.open {
            display: flex;
        }

        .modal-content {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 24px;
            min-width: 400px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .modal-title {
            font-size: 16px;
            font-weight: 600;
        }

        .modal-close {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: var(--vscode-foreground);
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-group label {
            display: block;
            margin-bottom: 4px;
            font-weight: 500;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: inherit;
            font-size: inherit;
        }

        .form-group textarea {
            min-height: 80px;
            resize: vertical;
        }

        .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 24px;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="btnAdd" class="primary">+ Add Item</button>
        <button id="btnAddCommand" class="secondary">+ Add Command</button>
        <div style="flex: 1;"></div>
        <button id="btnUndo" class="secondary" disabled>Undo</button>
        <button id="btnRedo" class="secondary" disabled>Redo</button>
        <button id="btnRefresh" class="secondary">Refresh</button>
        <button id="btnSave" class="primary">Save</button>
    </div>

    <div class="section">
        <div class="section-header">
            <span class="section-title">Menu Items</span>
        </div>
        <div id="menuTree" class="menu-tree">
            <div class="empty-state">Loading...</div>
        </div>
    </div>

    <div class="section">
        <div class="section-header">
            <span class="section-title">Commands</span>
        </div>
        <div id="commandsList" class="menu-tree">
            <div class="empty-state">No commands defined</div>
        </div>
    </div>

    <!-- Edit Item Modal -->
    <div id="editModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <span class="modal-title" id="modalTitle">Edit Item</span>
                <button class="modal-close" id="modalClose">&times;</button>
            </div>
            <form id="editForm">
                <div class="form-group">
                    <label for="itemLabel">Label *</label>
                    <input type="text" id="itemLabel" required>
                </div>
                <div class="form-group">
                    <label for="itemIcon">Icon</label>
                    <input type="text" id="itemIcon" placeholder="e.g., $(terminal) or emoji">
                </div>
                <div class="form-group">
                    <label for="itemType">Type</label>
                    <select id="itemType">
                        <option value="">Category (has children)</option>
                        <option value="terminal">Terminal</option>
                        <option value="vscodeCommand">VS Code Command</option>
                        <option value="task">Task</option>
                        <option value="ref">Reference (ref)</option>
                    </select>
                </div>
                <div id="actionFields" style="display: none;">
                    <div class="form-group">
                        <label for="itemCommand">Command</label>
                        <input type="text" id="itemCommand">
                    </div>
                    <div class="form-group" id="terminalNameGroup">
                        <label for="itemTerminal">Terminal Name</label>
                        <input type="text" id="itemTerminal">
                    </div>
                    <div class="form-group" id="cwdGroup">
                        <label for="itemCwd">Working Directory</label>
                        <input type="text" id="itemCwd" placeholder="\${workspaceFolder}">
                    </div>
                </div>
                <div id="refField" style="display: none;">
                    <div class="form-group">
                        <label for="itemRef">Reference</label>
                        <select id="itemRef"></select>
                    </div>
                </div>
                <input type="hidden" id="editPath">
                <div class="form-actions">
                    <button type="button" class="secondary" id="cancelEdit">Cancel</button>
                    <button type="submit" class="primary">Save</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        let config = null;
        let editingPath = null;
        let dragSource = null;

        // DOM Elements
        const menuTree = document.getElementById('menuTree');
        const commandsList = document.getElementById('commandsList');
        const editModal = document.getElementById('editModal');
        const editForm = document.getElementById('editForm');
        const btnUndo = document.getElementById('btnUndo');
        const btnRedo = document.getElementById('btnRedo');

        // Event Listeners
        document.getElementById('btnAdd').addEventListener('click', () => openAddModal());
        document.getElementById('btnAddCommand').addEventListener('click', () => openAddCommandModal());
        document.getElementById('btnUndo').addEventListener('click', () => vscode.postMessage({ type: 'undo' }));
        document.getElementById('btnRedo').addEventListener('click', () => vscode.postMessage({ type: 'redo' }));
        document.getElementById('btnRefresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
        document.getElementById('btnSave').addEventListener('click', () => vscode.postMessage({ type: 'save' }));
        document.getElementById('modalClose').addEventListener('click', closeModal);
        document.getElementById('cancelEdit').addEventListener('click', closeModal);
        document.getElementById('itemType').addEventListener('change', updateFormFields);

        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveItem();
        });

        // Receive messages from extension
        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.type) {
                case 'config':
                    config = message.config;
                    btnUndo.disabled = !message.canUndo;
                    btnRedo.disabled = !message.canRedo;
                    renderConfig();
                    break;
            }
        });

        function renderConfig() {
            if (!config) {
                menuTree.innerHTML = '<div class="empty-state">No configuration loaded</div>';
                commandsList.innerHTML = '<div class="empty-state">No commands defined</div>';
                return;
            }

            // Render menu items
            if (config.menu && config.menu.length > 0) {
                menuTree.innerHTML = renderMenuItems(config.menu, []);
            } else {
                menuTree.innerHTML = '<div class="empty-state">No menu items. Click "Add Item" to create one.</div>';
            }

            // Render commands
            if (config.commands && Object.keys(config.commands).length > 0) {
                commandsList.innerHTML = Object.entries(config.commands).map(([name, cmd]) =>
                    '<div class="menu-item">' +
                        '<span class="icon">📦</span>' +
                        '<span class="label">' + escapeHtml(name) + '</span>' +
                        '<span class="type-badge">' + cmd.type + '</span>' +
                        '<span style="color: var(--vscode-descriptionForeground); font-size: 12px;">' + escapeHtml(cmd.command) + '</span>' +
                        '<div class="actions">' +
                            '<button onclick="editCommand(\\'' + escapeHtml(name) + '\\')">Edit</button>' +
                            '<button class="delete" onclick="deleteCommand(\\'' + escapeHtml(name) + '\\')">Delete</button>' +
                        '</div>' +
                    '</div>'
                ).join('');
            } else {
                commandsList.innerHTML = '<div class="empty-state">No commands defined</div>';
            }

            // Add drag and drop listeners
            addDragListeners();
        }

        function renderMenuItems(items, path) {
            return items.map((item, index) => {
                const itemPath = [...path, index];
                const pathStr = JSON.stringify(itemPath);
                const hasChildren = item.children && item.children.length > 0;
                const icon = item.icon || (hasChildren ? '📁' : '💻');
                const typeBadge = item.ref ? 'ref: ' + item.ref : (item.type || 'category');

                let html = '<div class="menu-item" draggable="true" data-path="' + pathStr + '">' +
                    '<span class="drag-handle">⋮⋮</span>' +
                    '<span class="icon">' + escapeHtml(icon) + '</span>' +
                    '<span class="label">' + escapeHtml(item.label) + '</span>' +
                    '<span class="type-badge">' + typeBadge + '</span>' +
                    '<div class="actions">' +
                        '<button onclick="editItem(' + pathStr + ')">Edit</button>';

                if (hasChildren) {
                    html += '<button onclick="addChildItem(' + pathStr + ')">Add Child</button>';
                }

                html += '<button class="delete" onclick="deleteItem(' + pathStr + ')">Delete</button>' +
                    '</div></div>';

                if (hasChildren) {
                    html += '<div class="children">' + renderMenuItems(item.children, itemPath) + '</div>';
                }

                return html;
            }).join('');
        }

        function addDragListeners() {
            const items = document.querySelectorAll('.menu-item[draggable]');
            items.forEach(item => {
                item.addEventListener('dragstart', handleDragStart);
                item.addEventListener('dragend', handleDragEnd);
                item.addEventListener('dragover', handleDragOver);
                item.addEventListener('dragleave', handleDragLeave);
                item.addEventListener('drop', handleDrop);
            });
        }

        function handleDragStart(e) {
            dragSource = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.dataset.path);
        }

        function handleDragEnd(e) {
            this.classList.remove('dragging');
            document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        }

        function handleDragOver(e) {
            e.preventDefault();
            if (this !== dragSource) {
                this.classList.add('drag-over');
            }
        }

        function handleDragLeave(e) {
            this.classList.remove('drag-over');
        }

        function handleDrop(e) {
            e.preventDefault();
            this.classList.remove('drag-over');

            if (this === dragSource) return;

            const fromPath = JSON.parse(dragSource.dataset.path);
            const toPath = JSON.parse(this.dataset.path);

            vscode.postMessage({
                type: 'moveItem',
                path: fromPath,
                targetPath: toPath
            });
        }

        function openAddModal(parentPath) {
            editingPath = null;
            document.getElementById('modalTitle').textContent = 'Add Item';
            editForm.reset();
            updateFormFields();
            updateRefOptions();
            editModal.classList.add('open');
        }

        function addChildItem(path) {
            editingPath = null;
            document.getElementById('modalTitle').textContent = 'Add Child Item';
            document.getElementById('editPath').value = JSON.stringify([...path, -1]);
            editForm.reset();
            updateFormFields();
            updateRefOptions();
            editModal.classList.add('open');
        }

        function editItem(path) {
            const item = getItemAtPath(config.menu, path);
            if (!item) return;

            editingPath = path;
            document.getElementById('modalTitle').textContent = 'Edit Item';
            document.getElementById('itemLabel').value = item.label || '';
            document.getElementById('itemIcon').value = item.icon || '';

            if (item.ref) {
                document.getElementById('itemType').value = 'ref';
            } else if (item.children && item.children.length > 0) {
                document.getElementById('itemType').value = '';
            } else {
                document.getElementById('itemType').value = item.type || '';
            }

            document.getElementById('itemCommand').value = item.command || '';
            document.getElementById('itemTerminal').value = item.terminal || '';
            document.getElementById('itemCwd').value = item.cwd || '';

            updateFormFields();
            updateRefOptions();

            if (item.ref) {
                document.getElementById('itemRef').value = item.ref;
            }

            editModal.classList.add('open');
        }

        function deleteItem(path) {
            if (confirm('Are you sure you want to delete this item?')) {
                vscode.postMessage({
                    type: 'deleteItem',
                    path: path
                });
            }
        }

        function closeModal() {
            editModal.classList.remove('open');
            editingPath = null;
        }

        function updateFormFields() {
            const type = document.getElementById('itemType').value;
            const actionFields = document.getElementById('actionFields');
            const refField = document.getElementById('refField');
            const terminalNameGroup = document.getElementById('terminalNameGroup');
            const cwdGroup = document.getElementById('cwdGroup');

            if (type === 'ref') {
                actionFields.style.display = 'none';
                refField.style.display = 'block';
            } else if (type === '' || !type) {
                actionFields.style.display = 'none';
                refField.style.display = 'none';
            } else {
                actionFields.style.display = 'block';
                refField.style.display = 'none';

                terminalNameGroup.style.display = type === 'terminal' ? 'block' : 'none';
                cwdGroup.style.display = type === 'terminal' ? 'block' : 'none';
            }
        }

        function updateRefOptions() {
            const select = document.getElementById('itemRef');
            select.innerHTML = '<option value="">Select a command...</option>';

            if (config && config.commands) {
                Object.keys(config.commands).forEach(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    select.appendChild(option);
                });
            }
        }

        function saveItem() {
            const type = document.getElementById('itemType').value;
            const item = {
                label: document.getElementById('itemLabel').value
            };

            const icon = document.getElementById('itemIcon').value;
            if (icon) item.icon = icon;

            if (type === 'ref') {
                item.ref = document.getElementById('itemRef').value;
            } else if (type && type !== '') {
                item.type = type;
                item.command = document.getElementById('itemCommand').value;

                if (type === 'terminal') {
                    const terminal = document.getElementById('itemTerminal').value;
                    const cwd = document.getElementById('itemCwd').value;
                    if (terminal) item.terminal = terminal;
                    if (cwd) item.cwd = cwd;
                }
            }

            if (editingPath !== null) {
                vscode.postMessage({
                    type: 'updateItem',
                    path: editingPath,
                    item: item
                });
            } else {
                const editPathValue = document.getElementById('editPath').value;
                let path = editPathValue ? JSON.parse(editPathValue) : undefined;

                // Handle child add (path ends with -1)
                if (path && path[path.length - 1] === -1) {
                    const parentPath = path.slice(0, -1);
                    const parentItem = getItemAtPath(config.menu, parentPath);
                    if (parentItem) {
                        path = [...parentPath, (parentItem.children || []).length];
                    }
                }

                vscode.postMessage({
                    type: 'addItem',
                    item: item,
                    path: path
                });
            }

            closeModal();
        }

        function getItemAtPath(items, path) {
            if (!items || path.length === 0) return null;
            const index = path[0];
            if (index < 0 || index >= items.length) return null;
            const item = items[index];
            if (path.length === 1) return item;
            return getItemAtPath(item.children, path.slice(1));
        }

        function openAddCommandModal() {
            const name = prompt('Command name:');
            if (!name) return;

            const type = prompt('Type (terminal, vscodeCommand, task):', 'terminal');
            if (!type) return;

            const command = prompt('Command:');
            if (!command) return;

            vscode.postMessage({
                type: 'addCommand',
                commandName: name,
                command: { type, command }
            });
        }

        function editCommand(name) {
            const cmd = config.commands[name];
            const newCommand = prompt('Command:', cmd.command);
            if (newCommand !== null) {
                vscode.postMessage({
                    type: 'updateCommand',
                    commandName: name,
                    command: { ...cmd, command: newCommand }
                });
            }
        }

        function deleteCommand(name) {
            if (confirm('Are you sure you want to delete command "' + name + '"?')) {
                vscode.postMessage({
                    type: 'deleteCommand',
                    commandName: name
                });
            }
        }

        function escapeHtml(text) {
            if (!text) return '';
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        // Notify extension we're ready
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }

    /**
     * リソースを解放
     */
    public dispose(): void {
        ConfigEditorPanel._currentPanel = undefined;

        this._panel.dispose();
        this._editor.dispose();

        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
