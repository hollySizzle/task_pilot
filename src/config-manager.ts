/**
 * TaskPilot Configuration Manager
 * YAML設定ファイルの読み込み・監視・ref解決を行う
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { parseMenuConfig, validateGlobalMenu, YamlParseError } from './yaml-parser';
import { MenuConfig, MenuItem, ResolvedAction, CommandDefinition, ActionDefinition } from './types';

/**
 * 設定変更イベントの型
 *
 * `effectivePath` / `fallbackReason` は #11437 で追加 (additive・optional)。
 * 実際に読みに行った path と、configured path からの fallback が起きた場合の
 * 理由を診断用に運ぶ。既存 consumer は無視してよい。
 */
export interface ConfigChangeEvent {
    config: MenuConfig | null;
    error?: Error;
    effectivePath?: string | null;
    fallbackReason?: string;
}

/**
 * workspace default の config 相対パス。`taskPilot.configPath` 未設定時の
 * default 値であり、絶対 configPath が到達不能なときの fallback 先でもある。
 */
export const DEFAULT_CONFIG_RELATIVE_PATH = '.vscode/task-menu.yaml';

export type ConfigCandidateSource = 'configured' | 'workspace-default-fallback';

/**
 * 実際に読み込む config ファイルの候補。
 * `source === 'workspace-default-fallback'` のとき `fallbackReason` が
 * configured path がなぜ使われなかったかを説明する。
 */
export interface ConfigLoadCandidate {
    path: string;
    source: ConfigCandidateSource;
    fallbackReason?: string;
}

/**
 * configured path の解決と「実際に読む候補」の選定を分離する (#11436 / #11437)。
 *
 * 背景: v0.6.9 の `exportGlobalMenu` は User 設定 `taskPilot.configPath` に
 * User ディレクトリの絶対パスを書く。Dev Container / remote workspace では
 * その絶対パスが container 内に存在せず、従来の「configured path だけを読む」
 * 実装では workspace-local `.vscode/task-menu.yaml` が永久に隠れていた。
 *
 * 候補順:
 * 1. configured path が readable → そのまま使う。**readable な custom 絶対
 *    パスを fallback が上書きすることはない** (local の既存挙動を壊さない)。
 * 2. configured が「絶対パスとして設定」かつ unreadable、workspace default
 *    `.vscode/task-menu.yaml` が readable → workspace default へ fallback。
 *    remote 判定 API には依存しない保守的な file-exists 判定 (#54785
 *    Suggested Direction)。
 * 3. それ以外 → configured を返し、従来どおり読み込み失敗として扱う
 *    (missing 通知は configured path を指す)。
 *
 * 相対 `configPath` (default 含む) は `configuredIsAbsoluteSetting === false`
 * なので fallback 対象外 — 挙動は従来と完全に同じ。
 */
export function selectConfigLoadCandidate(input: {
    /** getConfigPath() が返した絶対化済み configured path */
    configuredPath: string;
    /** raw の `taskPilot.configPath` 設定値が絶対パスだったか */
    configuredIsAbsoluteSetting: boolean;
    /** configured path が file として readable か */
    configuredReadable: boolean;
    /** workspace default `.vscode/task-menu.yaml` の絶対パス (workspace なしなら null) */
    workspaceDefaultPath: string | null;
    /** workspace default が file として readable か */
    workspaceDefaultReadable: boolean;
}): ConfigLoadCandidate {
    if (input.configuredReadable) {
        return { path: input.configuredPath, source: 'configured' };
    }

    if (
        input.configuredIsAbsoluteSetting &&
        input.workspaceDefaultPath &&
        input.workspaceDefaultReadable &&
        input.workspaceDefaultPath !== input.configuredPath
    ) {
        return {
            path: input.workspaceDefaultPath,
            source: 'workspace-default-fallback',
            fallbackReason:
                `configured absolute taskPilot.configPath is not readable from this workspace: ${input.configuredPath}`
        };
    }

    return { path: input.configuredPath, source: 'configured' };
}

export interface GlobalMenuExportSkip {
    label: string;
    reason: string;
}

export interface GlobalMenuExportResult {
    menu: MenuItem[];
    skipped: GlobalMenuExportSkip[];
}

/**
 * VS Code User ディレクトリ配下の共有 `task-menu.yaml` の絶対パスを解決する。
 *
 * `globalStorageFsPath` には `ExtensionContext.globalStorageUri.fsPath`
 * (`<userData>/User/globalStorage/<ext-id>`) を渡す。2 階層上が User ディレクトリ
 * (`settings.json` と同じ場所) なので、そこに `task-menu.yaml` を置く。globalStorage
 * を基準にするため、stable / Insiders / VSCodium / portable / code-server いずれでも
 * 正しい User ディレクトリを得られ、`${userHome}` のような未展開変数を埋め込まない。
 * 入力が絶対パスなら返り値も常に絶対パスになる。
 */
export function resolveUserTaskMenuPath(globalStorageFsPath: string): string {
    const userDir = path.dirname(path.dirname(globalStorageFsPath));
    return path.join(userDir, 'task-menu.yaml');
}

/**
 * export 済みの menu 配列を、User-level `task-menu.yaml` に書き出せる完全な
 * `MenuConfig` (`version: "1.0"` + `menu`) に包む。
 */
export function buildMenuConfigExport(menu: MenuItem[]): MenuConfig {
    return { version: '1.0', menu };
}

/**
 * export 対象 menu と既存 `taskPilot.globalMenu` の top-level label 重複を返す。
 *
 * configPath 経由の User-level menu へ移行する際、同じ label が `globalMenu` に
 * 残っていると重複表示 / shadow になり得るため、移行ガイダンスのために検出する。
 * 返り値は export 側の出現順で、重複なしの label 一覧。
 */
export function detectGlobalMenuLabelOverlap(
    exportedMenu: MenuItem[],
    existingGlobalMenu: MenuItem[]
): string[] {
    const existingLabels = new Set(existingGlobalMenu.map(item => item.label));
    const overlap: string[] = [];
    for (const item of exportedMenu) {
        if (existingLabels.has(item.label) && !overlap.includes(item.label)) {
            overlap.push(item.label);
        }
    }
    return overlap;
}

/**
 * ConfigManager - 設定ファイルの管理クラス
 */
export class ConfigManager implements vscode.Disposable {
    private config: MenuConfig | null = null;
    private globalMenu: MenuItem[] = [];
    private fileWatcher: vscode.FileSystemWatcher | null = null;
    private configWatcher: vscode.Disposable | null = null;
    private currentConfigPath: string | null = null;
    private currentCandidate: ConfigLoadCandidate | null = null;

    private readonly _onConfigChanged = new vscode.EventEmitter<ConfigChangeEvent>();
    public readonly onConfigChanged = this._onConfigChanged.event;

    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(this._onConfigChanged);
    }

    /**
     * グローバルメニュー（ユーザー設定）を取得
     */
    getGlobalMenu(): MenuItem[] {
        return this.globalMenu;
    }

    /**
     * ワークスペースメニューとグローバルメニューをマージ
     * 重複（同じラベル）はワークスペース設定を優先
     */
    private mergeMenus(workspaceMenu: MenuItem[], globalMenu: MenuItem[]): MenuItem[] {
        if (globalMenu.length === 0) {
            return workspaceMenu;
        }

        const mergedMenu = workspaceMenu.map(item => ({ ...item }));

        for (const globalItem of globalMenu) {
            const workspaceIndex = mergedMenu.findIndex(item => item.label === globalItem.label);

            if (workspaceIndex === -1) {
                mergedMenu.push(globalItem);
                continue;
            }

            const workspaceItem = mergedMenu[workspaceIndex];
            if (this.canMergeCategories(workspaceItem, globalItem)) {
                mergedMenu[workspaceIndex] = {
                    ...workspaceItem,
                    children: this.mergeMenus(workspaceItem.children || [], globalItem.children || [])
                };
            }
        }

        return mergedMenu;
    }

    private canMergeCategories(workspaceItem: MenuItem, globalItem: MenuItem): boolean {
        return !!workspaceItem.children && workspaceItem.children.length > 0 &&
            !!globalItem.children && globalItem.children.length > 0;
    }

    /**
     * ConfigManagerを初期化し、設定ファイルの監視を開始
     */
    async initialize(): Promise<void> {
        // VS Code設定の変更監視
        this.configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('taskPilot.configPath') || e.affectsConfiguration('taskPilot.globalMenu')) {
                this.reloadConfig();
            }
        });
        this.disposables.push(this.configWatcher);

        // 初回読み込み
        await this.reloadConfig();
    }

    /**
     * 設定ファイルパスを取得
     *
     * これは「configured path」(設定が指す path) の解決であり、実際に読む
     * 候補の選定 (#11437 の fallback) は `reloadConfig()` 側で行う。
     * configured path が到達不能な場合の effective path は
     * `getEffectiveConfigPath()` を参照。
     */
    getConfigPath(): string | null {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }

        const configSetting = vscode.workspace
            .getConfiguration('taskPilot')
            .get<string>('configPath', DEFAULT_CONFIG_RELATIVE_PATH);

        // 絶対パスか相対パスかを判定
        if (path.isAbsolute(configSetting)) {
            return configSetting;
        }

        return path.join(workspaceFolder.uri.fsPath, configSetting);
    }

    /**
     * 直近の reload で実際に読みに行った path (fallback 込み) を返す。
     * まだ reload していない場合は null。
     */
    getEffectiveConfigPath(): string | null {
        return this.currentCandidate?.path ?? null;
    }

    /**
     * path が file として readable かを best-effort で判定する。
     * stat 失敗 (missing / 権限 / remote 非到達) は false。
     */
    private async isReadableFile(fsPath: string): Promise<boolean> {
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fsPath));
            // FileType はビットフラグ (SymbolicLink | File など) なので包含判定にする
            return (stat.type & vscode.FileType.File) !== 0;
        } catch {
            return false;
        }
    }

    /**
     * configured path から実際に読む候補を選定する (#11436 / #11437)。
     * 判定の本体は pure な `selectConfigLoadCandidate` (unit test 対象)。
     */
    private async resolveLoadCandidate(configuredPath: string): Promise<ConfigLoadCandidate> {
        const rawSetting = vscode.workspace
            .getConfiguration('taskPilot')
            .get<string>('configPath', DEFAULT_CONFIG_RELATIVE_PATH);
        const configuredIsAbsoluteSetting = path.isAbsolute(rawSetting);

        const configuredReadable = await this.isReadableFile(configuredPath);

        // readable なら fallback 判定は不要 — workspace default の stat を省く
        if (configuredReadable || !configuredIsAbsoluteSetting) {
            return selectConfigLoadCandidate({
                configuredPath,
                configuredIsAbsoluteSetting,
                configuredReadable,
                workspaceDefaultPath: null,
                workspaceDefaultReadable: false
            });
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workspaceDefaultPath = workspaceFolder
            ? path.join(workspaceFolder.uri.fsPath, DEFAULT_CONFIG_RELATIVE_PATH)
            : null;
        const workspaceDefaultReadable = workspaceDefaultPath
            ? await this.isReadableFile(workspaceDefaultPath)
            : false;

        return selectConfigLoadCandidate({
            configuredPath,
            configuredIsAbsoluteSetting,
            configuredReadable,
            workspaceDefaultPath,
            workspaceDefaultReadable
        });
    }

    /**
     * 設定ファイルを再読み込み
     *
     * configured path (getConfigPath) と実際に読む候補の選定を分離する
     * (#11436 / #11437)。到達不能な絶対 configPath が workspace default を
     * 隠さないよう、候補選定が fallback を解決してから読みに行く。
     */
    async reloadConfig(): Promise<void> {
        const configPath = this.getConfigPath();
        let globalMenuError: Error | undefined;

        try {
            this.globalMenu = this.loadGlobalMenu();
        } catch (error) {
            this.globalMenu = [];
            globalMenuError = error instanceof Error ? error : new Error(String(error));
        }

        if (!configPath) {
            this.currentCandidate = null;
            if (this.currentConfigPath !== null) {
                this.setupFileWatcher(null);
                this.currentConfigPath = null;
            }
            this.config = null;
            this._onConfigChanged.fire({
                config: null,
                error: globalMenuError || new Error('No workspace folder open'),
                effectivePath: null
            });
            if (globalMenuError) {
                this.showGlobalMenuErrorNotification(globalMenuError);
            }
            return;
        }

        const candidate = await this.resolveLoadCandidate(configPath);
        this.currentCandidate = candidate;
        if (candidate.fallbackReason) {
            console.info(
                `TaskPilot: loading workspace default ${candidate.path} (${candidate.fallbackReason})`
            );
        }

        // 実際に読む path が変更された場合、ファイルウォッチャーを更新
        if (candidate.path !== this.currentConfigPath) {
            this.setupFileWatcher(candidate.path);
            this.currentConfigPath = candidate.path;
        }

        try {
            const uri = vscode.Uri.file(candidate.path);
            const content = await vscode.workspace.fs.readFile(uri);
            const text = new TextDecoder().decode(content);

            this.config = parseMenuConfig(text);
            this._onConfigChanged.fire({
                config: this.config,
                error: globalMenuError,
                effectivePath: candidate.path,
                fallbackReason: candidate.fallbackReason
            });
            if (globalMenuError) {
                this.showGlobalMenuErrorNotification(globalMenuError);
            }
        } catch (error) {
            this.config = null;
            const err = error instanceof Error ? error : new Error(String(error));

            // ファイルが存在しない場合は静かに失敗
            if (err.message.includes('ENOENT') || err.message.includes('FileNotFound')) {
                this._onConfigChanged.fire({
                    config: null,
                    error: globalMenuError || new Error(`Configuration file not found: ${candidate.path}`),
                    effectivePath: candidate.path,
                    fallbackReason: candidate.fallbackReason
                });
                if (globalMenuError) {
                    this.showGlobalMenuErrorNotification(globalMenuError);
                }
            } else {
                // パースエラーなどは通知
                this._onConfigChanged.fire({
                    config: null,
                    error: err,
                    effectivePath: candidate.path,
                    fallbackReason: candidate.fallbackReason
                });
                this.showErrorNotification(err);
                if (globalMenuError) {
                    this.showGlobalMenuErrorNotification(globalMenuError);
                }
            }
        }
    }

    /**
     * ユーザー設定の globalMenu を読み込み・検証
     */
    private loadGlobalMenu(): MenuItem[] {
        const rawGlobalMenu = vscode.workspace
            .getConfiguration('taskPilot')
            .get<unknown>('globalMenu', []);

        const { result, menu } = validateGlobalMenu(rawGlobalMenu);
        if (!result.valid || !menu) {
            const errorMessages = result.errors
                .map(e => e.path ? `${e.path}: ${e.message}` : e.message)
                .join('\n');
            throw new Error(`Global menu validation failed:\n${errorMessages}`);
        }

        return menu;
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
                // fallback 中はエラーの発生源 (実際に読んだ file) を開く (#11437)
                const configPath = this.getEffectiveConfigPath() ?? this.getConfigPath();
                if (configPath) {
                    vscode.workspace.openTextDocument(configPath).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                }
            }
        });
    }

    /**
     * globalMenu 設定エラー通知を表示
     */
    private showGlobalMenuErrorNotification(error: Error): void {
        const message = `TaskPilot: ${error.message}`;

        vscode.window.showErrorMessage(message, 'Open Settings').then(selection => {
            if (selection === 'Open Settings') {
                void vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    '@ext:hollySizzle.taskpilot taskPilot.globalMenu'
                );
            }
        });
    }

    /**
     * 現在の設定を取得（グローバルメニューをマージ済み）
     */
    getConfig(): MenuConfig | null {
        const globalMenu = this.getGlobalMenu();

        // ワークスペース設定がない場合
        if (!this.config) {
            // グローバルメニューがあれば仮想的なMenuConfigを返す
            if (globalMenu.length > 0) {
                return {
                    version: '1.0',
                    menu: globalMenu
                };
            }
            return null;
        }

        // ワークスペース設定とグローバルメニューをマージ
        return {
            ...this.config,
            menu: this.mergeMenus(this.config.menu, globalMenu)
        };
    }

    /**
     * ワークスペース設定のみを取得（マージなし）
     */
    getWorkspaceConfig(): MenuConfig | null {
        return this.config;
    }

    /**
     * workspace menu から globalMenu 向けの export データを生成
     * source を省略した場合は保存済み workspace config を使用する。
     * Config Editor などの「未保存編集を含む config」を export 元にしたい場合は
     * source に渡す。
     */
    buildGlobalMenuExport(source?: MenuConfig | null): GlobalMenuExportResult {
        const workspaceConfig = source ?? this.getWorkspaceConfig();
        if (!workspaceConfig) {
            return { menu: [], skipped: [] };
        }

        const exported: MenuItem[] = [];
        const skipped: GlobalMenuExportSkip[] = [];

        for (const item of workspaceConfig.menu) {
            if (this.containsRef(item)) {
                skipped.push({
                    label: item.label,
                    reason: 'contains ref'
                });
                continue;
            }

            exported.push(item);
        }

        return {
            menu: exported,
            skipped
        };
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
            // インラインアクション（terminal, shellCommand, vscodeCommand, task）
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
            // Remote系アクション（openInDevContainer, openRemoteSSH, openRemoteTunnel）
            return {
                type: item.type,
                path: item.path,
                host: item.host,
                tunnelName: item.tunnelName,
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
            host: cmd.host,
            tunnelName: cmd.tunnelName
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
            // インラインアクション（terminal, shellCommand, vscodeCommand, task）
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
            // Remote系アクション（openInDevContainer, openRemoteSSH, openRemoteTunnel）
            return {
                type: actionDef.type,
                path: actionDef.path,
                host: actionDef.host,
                tunnelName: actionDef.tunnelName,
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

    private containsRef(item: MenuItem): boolean {
        if (item.ref) {
            return true;
        }

        if (item.actions?.some(action => !!action.ref)) {
            return true;
        }

        if (item.parallel?.some(action => !!action.ref)) {
            return true;
        }

        if (item.children?.some(child => this.containsRef(child))) {
            return true;
        }

        return false;
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
