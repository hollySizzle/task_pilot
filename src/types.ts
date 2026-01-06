/**
 * TaskPilot Type Definitions
 *
 * TaskPilotのYAML設定ファイルの型定義。
 * このファイルはSSoT（Single Source of Truth）として、
 * JSON SchemaおよびサンプルYAMLの自動生成に使用されます。
 *
 * @packageDocumentation
 */

/**
 * アクションタイプ
 *
 * TaskPilotがサポートするアクションの種類を定義します。
 *
 * - `terminal`: ターミナルでシェルコマンドを実行
 * - `vscodeCommand`: VS Codeの内蔵コマンドを実行
 * - `task`: VS Codeのタスクを実行
 * - `openInDevContainer`: DevContainerでフォルダを開く
 * - `openRemoteSSH`: Remote-SSHでフォルダを開く
 * - `openRemoteTunnel`: Remote Tunnelでフォルダを開く
 *
 * @example
 * ```yaml
 * type: terminal
 * command: npm run build
 * ```
 *
 * @example
 * ```yaml
 * type: openInDevContainer
 * path: /home/user/project
 * ```
 *
 * @example
 * ```yaml
 * type: openRemoteSSH
 * path: /home/user/project
 * host: my-server
 * ```
 *
 * @example
 * ```yaml
 * type: openRemoteTunnel
 * path: /home/user/project
 * tunnelName: my-tunnel
 * ```
 */
export type ActionType = 'terminal' | 'vscodeCommand' | 'task' | 'openInDevContainer' | 'openRemoteSSH' | 'openRemoteTunnel';

/**
 * コマンド定義
 *
 * `commands`セクションで定義する再利用可能なコマンド。
 * 定義したコマンドはメニュー項目から`ref`で参照できます。
 *
 * @example
 * ```yaml
 * commands:
 *   build:
 *     type: terminal
 *     command: npm run build
 *     description: プロジェクトをビルド
 *   open-settings:
 *     type: vscodeCommand
 *     command: workbench.action.openSettings
 * ```
 */
export interface CommandDefinition {
    /**
     * アクションタイプ
     * @example "terminal"
     */
    type: ActionType;

    /**
     * 実行するコマンド
     *
     * - `terminal`: シェルコマンド（例: `npm run build`）
     * - `vscodeCommand`: VS CodeコマンドID（例: `workbench.action.openSettings`）
     * - `task`: タスク名（例: `build`）
     *
     * @example "npm run build"
     */
    command: string;

    /**
     * ターミナル名（type: terminal の場合）
     *
     * 指定するとそのターミナル名で新しいターミナルを作成または再利用します。
     * 省略時は共有ターミナルを使用します。
     *
     * @example "server"
     */
    terminal?: string;

    /**
     * コマンド引数（type: vscodeCommand の場合）
     *
     * VS Codeコマンドに渡す引数の配列。
     *
     * @example ["extensionId"]
     */
    args?: unknown[];

    /**
     * 作業ディレクトリ（type: terminal の場合）
     *
     * コマンドを実行するディレクトリ。相対パスはワークスペースルートからの相対パス。
     *
     * @example "./packages/app"
     */
    cwd?: string;

    /**
     * コマンドの説明
     *
     * UIに表示される説明文。
     *
     * @example "プロジェクトをビルドします"
     */
    description?: string;

    /**
     * フォルダパス（type: openInDevContainer, openRemoteSSH の場合）
     *
     * 開くフォルダの絶対パス。
     *
     * @example "/home/user/project"
     */
    path?: string;

    /**
     * SSHホスト名（type: openRemoteSSH の場合）
     *
     * ~/.ssh/config で定義されているHost名を指定。
     *
     * @example "my-server"
     */
    host?: string;

    /**
     * トンネル名（type: openRemoteTunnel の場合）
     *
     * VS Code Remote Tunnelで登録されているトンネル名を指定。
     *
     * @example "my-tunnel"
     */
    tunnelName?: string;
}

/**
 * アクション定義
 *
 * `actions`または`parallel`配列内で使用するアクションの定義。
 * `ref`でコマンドを参照するか、インラインでアクションを定義します。
 *
 * @example
 * ```yaml
 * actions:
 *   - ref: build          # コマンド参照
 *   - type: terminal      # インライン定義
 *     command: npm test
 * ```
 */
export interface ActionDefinition {
    /**
     * コマンド参照
     *
     * `commands`セクションで定義したコマンド名を参照します。
     * `ref`を使用する場合、他のプロパティ（type, command等）は不要です。
     *
     * @example "build"
     */
    ref?: string;

    /**
     * アクションタイプ（ref未使用時）
     * @example "terminal"
     */
    type?: ActionType;

    /**
     * 実行するコマンド（ref未使用時）
     * @example "npm run build"
     */
    command?: string;

    /**
     * ターミナル名（type: terminal、ref未使用時）
     * @example "server"
     */
    terminal?: string;

    /**
     * コマンド引数（type: vscodeCommand、ref未使用時）
     * @example ["extensionId"]
     */
    args?: unknown[];

    /**
     * 作業ディレクトリ（type: terminal、ref未使用時）
     * @example "./packages/app"
     */
    cwd?: string;

    /**
     * アクションの説明
     * @example "テストを実行"
     */
    description?: string;

    /**
     * フォルダパス（type: openInDevContainer, openRemoteSSH、ref未使用時）
     * @example "/home/user/project"
     */
    path?: string;

    /**
     * SSHホスト名（type: openRemoteSSH、ref未使用時）
     * @example "my-server"
     */
    host?: string;

    /**
     * トンネル名（type: openRemoteTunnel、ref未使用時）
     * @example "my-tunnel"
     */
    tunnelName?: string;
}

/**
 * メニュー項目
 *
 * サイドバーに表示されるメニュー項目の定義。
 * 再帰的な構造で、子メニュー（children）を持つことができます。
 *
 * ## 使用パターン
 *
 * 1. **単一アクション**: `ref`、または`type`+`command`で直接定義
 * 2. **カテゴリ（親メニュー）**: `children`で子メニューを定義
 * 3. **順次実行**: `actions`で複数アクションを順番に実行
 * 4. **並列実行**: `parallel`で複数アクションを同時実行（ターミナル分割）
 *
 * @example
 * ```yaml
 * menu:
 *   # 単一アクション（ref参照）
 *   - label: Build
 *     icon: "$(package)"
 *     ref: build
 *
 *   # カテゴリ（子メニューあり）
 *   - label: Git
 *     icon: "$(git-branch)"
 *     children:
 *       - label: Pull
 *         type: terminal
 *         command: git pull
 *
 *   # 順次実行
 *   - label: CI Pipeline
 *     actions:
 *       - ref: lint
 *       - ref: test
 *       - ref: build
 *
 *   # 並列実行
 *   - label: Dev Environment
 *     parallel:
 *       - type: terminal
 *         command: npm run watch
 *         terminal: watch
 *       - ref: start
 * ```
 */
export interface MenuItem {
    /**
     * 表示ラベル（必須）
     *
     * サイドバーに表示されるメニュー項目の名前。
     *
     * @example "Build"
     */
    label: string;

    /**
     * アイコン
     *
     * VS Code Codicon（`$(icon-name)`形式）または絵文字を指定。
     * Codiconの一覧: https://code.visualstudio.com/api/references/icons-in-labels
     *
     * @example "$(package)"
     * @example "🚀"
     */
    icon?: string;

    /**
     * 説明文
     *
     * メニュー項目の補足説明。ホバー時に表示されます。
     *
     * @example "プロジェクトをビルドします"
     */
    description?: string;

    /**
     * 子メニュー項目
     *
     * 指定するとこの項目はカテゴリ（親メニュー）になります。
     * `children`を指定した場合、アクション関連のプロパティは無視されます。
     */
    children?: MenuItem[];

    // --- アクション定義（childrenがない場合に使用）---

    /**
     * コマンド参照
     *
     * `commands`セクションで定義したコマンド名を参照。
     *
     * @example "build"
     */
    ref?: string;

    /**
     * アクションタイプ（ref未使用時）
     * @example "terminal"
     */
    type?: ActionType;

    /**
     * 実行するコマンド（ref未使用時）
     * @example "npm run build"
     */
    command?: string;

    /**
     * ターミナル名（type: terminal、ref未使用時）
     * @example "server"
     */
    terminal?: string;

    /**
     * コマンド引数（type: vscodeCommand、ref未使用時）
     */
    args?: unknown[];

    /**
     * 作業ディレクトリ（type: terminal、ref未使用時）
     * @example "./packages/app"
     */
    cwd?: string;

    /**
     * フォルダパス（type: openInDevContainer, openRemoteSSH、ref未使用時）
     * @example "/home/user/project"
     */
    path?: string;

    /**
     * SSHホスト名（type: openRemoteSSH、ref未使用時）
     * @example "my-server"
     */
    host?: string;

    /**
     * トンネル名（type: openRemoteTunnel、ref未使用時）
     * @example "my-tunnel"
     */
    tunnelName?: string;

    // --- 複数アクション ---

    /**
     * 順次実行アクション
     *
     * 配列内のアクションを順番に実行します。
     * 前のアクションが完了してから次のアクションを実行。
     */
    actions?: ActionDefinition[];

    /**
     * エラー時も続行
     *
     * `actions`使用時、エラーが発生しても残りのアクションを実行し続けます。
     *
     * @default false
     */
    continueOnError?: boolean;

    // --- 並列実行 ---

    /**
     * 並列実行アクション
     *
     * 配列内のアクションを同時に実行します。
     * ターミナルコマンドの場合、ターミナルを分割して表示。
     */
    parallel?: ActionDefinition[];
}

/**
 * ルート設定
 *
 * TaskPilotのYAML設定ファイルのルート構造。
 * `.vscode/taskpilot.yaml`に配置して使用します。
 *
 * @example
 * ```yaml
 * version: "1.0"
 *
 * commands:
 *   build:
 *     type: terminal
 *     command: npm run build
 *
 * menu:
 *   - label: Build
 *     icon: "$(package)"
 *     ref: build
 * ```
 */
export interface MenuConfig {
    /**
     * 設定ファイルのバージョン
     *
     * 現在は "1.0" を指定してください。
     *
     * @example "1.0"
     */
    version: string;

    /**
     * 再利用可能なコマンド定義
     *
     * ここで定義したコマンドは、メニュー項目から`ref`で参照できます。
     * 同じコマンドを複数の場所で使いたい場合に便利です。
     */
    commands?: Record<string, CommandDefinition>;

    /**
     * メニュー構造
     *
     * サイドバーに表示されるメニュー項目の配列。
     * 階層構造を持つことができます。
     */
    menu: MenuItem[];
}

/**
 * 解決済みアクション
 *
 * `ref`参照を解決した後の、実行可能なアクション情報。
 * 内部処理で使用される型です。
 */
export interface ResolvedAction {
    /** アクションタイプ */
    type: ActionType;
    /** 実行コマンド（terminal, vscodeCommand, task で使用） */
    command?: string;
    /** ターミナル名 */
    terminal?: string;
    /** コマンド引数 */
    args?: unknown[];
    /** 作業ディレクトリ */
    cwd?: string;
    /** 説明 */
    description?: string;
    /** フォルダパス（openInDevContainer, openRemoteSSH, openRemoteTunnel で使用） */
    path?: string;
    /** SSHホスト名（openRemoteSSH で使用） */
    host?: string;
    /** トンネル名（openRemoteTunnel で使用） */
    tunnelName?: string;
}

/**
 * QuickPick項目（内部用）
 *
 * VS CodeのQuickPick UIで使用される項目。
 */
export interface TaskPickItem {
    /** 表示ラベル */
    label: string;
    /** ラベル横の説明 */
    description?: string;
    /** ラベル下の詳細 */
    detail?: string;
    /** 元のメニュー項目 */
    menuItem: MenuItem;
    /** 戻るボタンかどうか */
    isBack?: boolean;
}

/**
 * バリデーションエラー（内部用）
 */
export interface ValidationError {
    /** エラーメッセージ */
    message: string;
    /** 問題のあるフィールドへのパス（例: "menu[0].children[1].ref"） */
    path?: string;
}

/**
 * バリデーション結果（内部用）
 */
export interface ValidationResult {
    /** 設定が有効かどうか */
    valid: boolean;
    /** エラーリスト（有効な場合は空） */
    errors: ValidationError[];
}

/**
 * 複数アクション実行オプション（内部用）
 */
export interface MultipleActionOptions {
    /** エラー時も続行するか */
    continueOnError?: boolean;
    /** キャンセルトークン */
    cancellationToken?: { isCancellationRequested: boolean };
    /** 進捗コールバック */
    onProgress?: (current: number, total: number, action: ResolvedAction) => void;
}

/**
 * アクションエラー情報（内部用）
 */
export interface ActionError {
    /** 失敗したアクションのインデックス */
    index: number;
    /** 失敗したアクション */
    action: ResolvedAction;
    /** 発生したエラー */
    error: Error;
}

/**
 * 複数アクション実行結果（内部用）
 */
export interface MultipleActionResult {
    /** 全アクション成功したか */
    success: boolean;
    /** 完了したアクション数 */
    completedCount: number;
    /** 総アクション数 */
    totalCount: number;
    /** キャンセルされたか */
    cancelled?: boolean;
    /** 停止原因のエラー（continueOnError: false時） */
    error?: Error;
    /** 失敗アクションのインデックス（continueOnError: false時） */
    failedIndex?: number;
    /** エラーリスト（continueOnError: true時） */
    errors?: ActionError[];
}

/**
 * アクショングループ（内部用）
 *
 * ターミナルコマンドのバッチ処理用。
 */
export type ActionGroup =
    | {
          type: 'single';
          action: ResolvedAction;
          startIndex: number;
      }
    | {
          type: 'terminal-group';
          actions: ResolvedAction[];
          terminalName: string;
          startIndex: number;
      };
