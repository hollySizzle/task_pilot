/**
 * TaskPilot Configuration Manager
 * YAML設定ファイルの読み込み・監視・ref解決を行う
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { parseMenuConfig, YamlParseError } from './yaml-parser';
import { MenuConfig, MenuItem, ResolvedAction, CommandDefinition, ActionDefinition } from './types';

/**
 * 設定変更イベントの型
 */
export interface ConfigChangeEvent {
    config: MenuConfig | null;
    error?: Error;
}

/**
 * ConfigManager - 設定ファイルの管理クラス
 */
export class ConfigManager implements vscode.Disposable {
    private config: MenuConfig | null = null;
    private fileWatcher: vscode.FileSystemWatcher | null = null;
    private configWatcher: vscode.Disposable | null = null;
    private currentConfigPath: string | null = null;

    private readonly _onConfigChanged = new vscode.EventEmitter<ConfigChangeEvent>();
    public readonly onConfigChanged = this._onConfigChanged.event;

    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(this._onConfigChanged);
    }

    /**
     * ConfigManagerを初期化し、設定ファイルの監視を開始
     */
    async initialize(): Promise<void> {
        // VS Code設定の変更監視
        this.configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('taskPilot.configPath')) {
                this.reloadConfig();
            }
        });
        this.disposables.push(this.configWatcher);

        // 初回読み込み
        await this.reloadConfig();
    }

    /**
     * 設定ファイルパスを取得
     */
    getConfigPath(): string | null {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }

        const configSetting = vscode.workspace
            .getConfiguration('taskPilot')
            .get<string>('configPath', '.vscode/task-menu.yaml');

        // 絶対パスか相対パスかを判定
        if (path.isAbsolute(configSetting)) {
            return configSetting;
        }

        return path.join(workspaceFolder.uri.fsPath, configSetting);
    }

    /**
     * 設定ファイルを再読み込み
     */
    async reloadConfig(): Promise<void> {
        const configPath = this.getConfigPath();

        // パスが変更された場合、ファイルウォッチャーを更新
        if (configPath !== this.currentConfigPath) {
            this.setupFileWatcher(configPath);
            this.currentConfigPath = configPath;
        }

        if (!configPath) {
            this.config = null;
            this._onConfigChanged.fire({ config: null, error: new Error('No workspace folder open') });
            return;
        }

        try {
            const uri = vscode.Uri.file(configPath);
            const content = await vscode.workspace.fs.readFile(uri);
            const text = new TextDecoder().decode(content);

            this.config = parseMenuConfig(text);
            this._onConfigChanged.fire({ config: this.config });
        } catch (error) {
            this.config = null;
            const err = error instanceof Error ? error : new Error(String(error));

            // ファイルが存在しない場合は静かに失敗
            if (err.message.includes('ENOENT') || err.message.includes('FileNotFound')) {
                this._onConfigChanged.fire({
                    config: null,
                    error: new Error(`Configuration file not found: ${configPath}`)
                });
            } else {
                // パースエラーなどは通知
                this._onConfigChanged.fire({ config: null, error: err });
                this.showErrorNotification(err);
            }
        }
    }

    /**
     * ファイルウォッチャーをセットアップ
     */
    private setupFileWatcher(configPath: string | null): void {
        // 既存のウォッチャーを破棄
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = null;
        }

        if (!configPath) {
            return;
        }

        // 新しいウォッチャーを作成
        const pattern = new vscode.RelativePattern(
            path.dirname(configPath),
            path.basename(configPath)
        );

        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.fileWatcher.onDidChange(() => this.reloadConfig());
        this.fileWatcher.onDidCreate(() => this.reloadConfig());
        this.fileWatcher.onDidDelete(() => {
            this.config = null;
            this._onConfigChanged.fire({
                config: null,
                error: new Error('Configuration file was deleted')
            });
        });

        this.disposables.push(this.fileWatcher);
    }

    /**
     * エラー通知を表示
     */
    private showErrorNotification(error: Error): void {
        let message = 'TaskPilot: Configuration error';

        if (error instanceof YamlParseError) {
            message = `TaskPilot: ${error.message}`;
        } else {
            message = `TaskPilot: ${error.message}`;
        }

        vscode.window.showErrorMessage(message, 'Open Settings').then(selection => {
            if (selection === 'Open Settings') {
                const configPath = this.getConfigPath();
                if (configPath) {
                    vscode.workspace.openTextDocument(configPath).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                }
            }
        });
    }

    /**
     * 現在の設定を取得
     */
    getConfig(): MenuConfig | null {
        return this.config;
    }

    /**
     * メニューアイテムのアクションを解決
     * ref参照を解決して実行可能なアクションを返す
     */
    resolveAction(item: MenuItem): ResolvedAction | null {
        if (item.children && item.children.length > 0) {
            // カテゴリアイテムはアクションを持たない
            return null;
        }

        if (item.ref) {
            // ref参照を解決
            const command = this.config?.commands?.[item.ref];
            if (!command) {
                vscode.window.showErrorMessage(`TaskPilot: Unknown command reference "${item.ref}"`);
                return null;
            }
            return this.commandToAction(command);
        }

        if (item.type && item.command) {
            // インラインアクション（terminal, vscodeCommand, task）
            return {
                type: item.type,
                command: item.command,
                terminal: item.terminal,
                args: item.args,
                cwd: item.cwd,
                description: item.description
            };
        }

        if (item.type && item.path) {
            // Remote系アクション（openInDevContainer, openRemoteSSH）
            return {
                type: item.type,
                path: item.path,
                host: item.host,
                description: item.description
            };
        }

        return null;
    }

    /**
     * CommandDefinitionをResolvedActionに変換
     */
    private commandToAction(cmd: CommandDefinition): ResolvedAction {
        return {
            type: cmd.type,
            command: cmd.command,
            terminal: cmd.terminal,
            args: cmd.args,
            cwd: cmd.cwd,
            description: cmd.description,
            path: cmd.path,
            host: cmd.host
        };
    }

    /**
     * メニューアイテムの複数アクションを解決
     * actions配列がある場合はそれを解決して返す
     * 親のterminal設定で子のterminalを上書きする
     */
    resolveActions(item: MenuItem): ResolvedAction[] | null {
        if (!item.actions || item.actions.length === 0) {
            // 単一アクションの場合
            const action = this.resolveAction(item);
            return action ? [action] : null;
        }

        const resolved: ResolvedAction[] = [];
        for (const actionDef of item.actions) {
            const action = this.resolveActionDefinition(actionDef);
            if (action) {
                resolved.push(action);
            }
        }

        if (resolved.length === 0) {
            return null;
        }

        // terminalアクションのterminal名を統一
        // 親のterminal設定があればそれを使用、なければ最初のアクションのterminalを使用
        const unifiedTerminal = item.terminal ||
            resolved.find(a => a.type === 'terminal')?.terminal ||
            'Actions';

        for (const action of resolved) {
            if (action.type === 'terminal') {
                action.terminal = unifiedTerminal;
            }
        }

        return resolved;
    }

    /**
     * ActionDefinitionをResolvedActionに変換
     */
    private resolveActionDefinition(actionDef: ActionDefinition): ResolvedAction | null {
        if (actionDef.ref) {
            // ref参照を解決
            const command = this.config?.commands?.[actionDef.ref];
            if (!command) {
                vscode.window.showErrorMessage(`TaskPilot: Unknown command reference "${actionDef.ref}"`);
                return null;
            }
            return this.commandToAction(command);
        }

        if (actionDef.type && actionDef.command) {
            // インラインアクション（terminal, vscodeCommand, task）
            return {
                type: actionDef.type,
                command: actionDef.command,
                terminal: actionDef.terminal,
                args: actionDef.args,
                cwd: actionDef.cwd,
                description: actionDef.description
            };
        }

        if (actionDef.type && actionDef.path) {
            // Remote系アクション（openInDevContainer, openRemoteSSH）
            return {
                type: actionDef.type,
                path: actionDef.path,
                host: actionDef.host,
                description: actionDef.description
            };
        }

        return null;
    }

    /**
     * メニューアイテムが複数アクションを持つかどうかを判定
     */
    hasMultipleActions(item: MenuItem): boolean {
        return !!item.actions && item.actions.length > 1;
    }

    /**
     * メニューアイテムが並列アクションを持つかどうかを判定
     */
    hasParallelActions(item: MenuItem): boolean {
        return !!item.parallel && item.parallel.length > 0;
    }

    /**
     * メニューアイテムの並列アクションを解決
     */
    resolveParallelActions(item: MenuItem): ResolvedAction[] | null {
        if (!item.parallel || item.parallel.length === 0) {
            return null;
        }

        const resolved: ResolvedAction[] = [];
        for (const actionDef of item.parallel) {
            const action = this.resolveActionDefinition(actionDef);
            if (action) {
                resolved.push(action);
            }
        }

        return resolved.length > 0 ? resolved : null;
    }

    /**
     * リソースを解放
     */
    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
    }
}
