# TaskPilot - 要求仕様書

## 1. 概要

### 1.1 目的
非エンジニアでも直感的に操作できる、階層型タスクメニューをVS Code上で提供する拡張機能。

### 1.2 背景
- 開発環境の操作（DB操作、コンテナ操作等）に複数のコマンドが必要
- 非エンジニアにとってターミナル操作は敷居が高い
- 既存の拡張機能はメンテナンスされていない or 要件を満たさない

### 1.3 スコープ

| Phase | 内容 | 優先度 |
|-------|------|--------|
| Phase 1 | Quick Pick UI + YAML設定 | 必須 |
| Phase 2 | Webview UI（リッチな見た目） | 任意 |

---

## 2. 機能要件

### 2.1 メニュー表示機能

| ID | 要件 | Phase |
|----|------|-------|
| F-001 | コマンドパレットからメニューを起動できる | 1 |
| F-002 | 階層的なカテゴリ選択ができる（2階層以上） | 1 |
| F-003 | 各項目にアイコン/絵文字を表示できる | 1 |
| F-004 | キーボードショートカットで起動できる | 1 |
| F-005 | サイドバーにWebview UIを表示できる | 2 |

### 2.2 アクション実行機能

| ID | 要件 | Phase |
|----|------|-------|
| F-010 | ターミナルにコマンドを流し込める | 1 |
| F-011 | 指定した名前のターミナルタブで実行できる | 1 |
| F-012 | VS Codeコマンドを実行できる | 1 |
| F-013 | VS Codeコマンドに引数を渡せる | 1 |
| F-014 | tasks.json のタスクを実行できる | 1 |
| F-015 | 複数アクションを順次実行できる | 2 |

### 2.3 設定機能

| ID | 要件 | Phase |
|----|------|-------|
| F-020 | YAMLファイルでメニュー構造を定義できる | 1 |
| F-021 | 設定ファイルのパスを指定できる | 1 |
| F-022 | 設定ファイル変更時に自動リロードできる | 1 |
| F-023 | 設定のバリデーションとエラー表示 | 1 |
| F-024 | コマンドを一箇所で定義し、複数メニューから参照できる（ref機能） | 1 |
| F-025 | 階層の深さに制限なし（推奨は2-3階層、トラブルシューティング等は深くなってもOK） | 1 |

---

## 3. 設定ファイル仕様

### 3.1 ファイル形式
- 形式: YAML
- デフォルトパス: `.vscode/task-menu.yaml`
- エンコーディング: UTF-8

### 3.2 スキーマ定義

```yaml
# .vscode/task-menu.yaml
version: "1.0"

# コマンド定義（再利用可能なアクションを一箇所で定義）
commands:
  command_id:              # 必須: 一意のID
    type: enum             # 必須: "terminal" | "vscodeCommand" | "task"
    command: string        # 必須: 実行するコマンド
    terminal: string       # 任意: ターミナル名（type: terminal の場合）
    args: array            # 任意: コマンド引数
    cwd: string            # 任意: 作業ディレクトリ
    description: string    # 任意: コマンドの説明

# メニュー構造定義
menu:
  - label: string          # 必須: 表示名
    icon: string           # 任意: アイコン（絵文字 or codicon）
    description: string    # 任意: 説明文（refで参照時は上書き可能）
    children:              # 任意: サブメニュー（これがあればカテゴリ、深さ制限なし）
      - label: string
        # ... 再帰的に定義可能

    # アクション定義（以下のいずれかが必須、children がない場合）
    ref: string            # commands で定義したIDを参照
    # または直接定義
    type: enum             # "terminal" | "vscodeCommand" | "task"
    command: string        # 実行するコマンド
    terminal: string       # 任意: ターミナル名（type: terminal の場合）
    args: array            # 任意: コマンド引数
    cwd: string            # 任意: 作業ディレクトリ
```

### 3.3 設計方針

| 方針 | 説明 |
|------|------|
| 階層の深さ | 制限なし（推奨は2-3階層、トラブルシューティング等は深くてもOK） |
| コマンドの再利用 | `commands` で定義し `ref` で参照（二重管理を防止） |
| ラベルの命名 | 非エンジニア向けに「何が起きるか」を明記 |
| 横断参照 | 同じコマンドを複数の文脈（通常操作/トラブルシュート）から参照可能 |

### 3.4 設定例

```yaml
version: "1.0"

# ===========================================
# コマンド定義（再利用可能）
# ===========================================
commands:
  recreate_db:
    type: terminal
    terminal: DB操作
    command: sh bin/recreate_db.sh
    description: DBを削除して空の状態から作り直します

  migrate_db:
    type: terminal
    terminal: DB操作
    command: rails db:migrate
    description: DBのテーブル構造を最新に更新します

  seed_db:
    type: terminal
    terminal: DB操作
    command: rails db:seed
    description: 開発用のサンプルデータを登録します

  rebuild_container:
    type: vscodeCommand
    command: remote-containers.rebuildContainer
    description: コンテナを再構築します

  rebuild_container_no_cache:
    type: vscodeCommand
    command: remote-containers.rebuildContainerWithoutCache
    description: キャッシュを使わずコンテナを完全に作り直します

  start_rails:
    type: terminal
    terminal: Rails
    command: rails s -b 0.0.0.0
    description: Railsサーバーを起動します

  stop_rails:
    type: terminal
    terminal: Rails
    command: kill -9 $(lsof -t -i:3000)
    description: Railsサーバーを停止します

# ===========================================
# メニュー構造
# ===========================================
menu:
  # --- DB操作 ---
  - label: DB操作
    icon: 🗄️
    children:
      - label: 初期化（データ全削除）
        icon: 🔄
        description: DBを削除して空の状態から作り直します。全データが消えます。
        ref: recreate_db

      - label: 構造を最新に更新
        icon: 📦
        description: DBのテーブル構造を最新の設計に合わせます。データは保持されます。
        ref: migrate_db

      - label: サンプルデータ作成
        icon: 🌱
        description: 開発・テスト用のサンプルデータを登録します。
        ref: seed_db

  # --- コンテナ操作 ---
  - label: コンテナ操作
    icon: 🐳
    children:
      - label: 再構築（通常）
        icon: 🔃
        description: コンテナを再構築します
        ref: rebuild_container

      - label: 完全に作り直す
        icon: 🏗️
        description: キャッシュを使わずコンテナを完全に作り直します（時間がかかります）
        ref: rebuild_container_no_cache

      - label: ワークスペースを開く
        icon: 📂
        type: vscodeCommand
        command: vscode.openFolder
        args:
          - /myapp/_kyakuyose-rails.code-workspace

  # --- 開発サーバー ---
  - label: 開発サーバー
    icon: 🚀
    children:
      - label: サーバー起動
        icon: ▶️
        ref: start_rails

      - label: サーバー停止
        icon: ⏹️
        ref: stop_rails

  # --- トラブルシューティング（横断参照の例） ---
  - label: トラブルシューティング
    icon: 🔧
    children:
      - label: DBエラーが発生した
        icon: ❌
        children:
          - label: DBを初期化する
            icon: 🔄
            description: DBを削除して作り直すことで解決する場合があります
            ref: recreate_db  # ← DB操作と同じコマンドを参照

          - label: DB構造を更新する
            icon: 📦
            description: マイグレーション忘れの場合はこちら
            ref: migrate_db   # ← DB操作と同じコマンドを参照

      - label: サーバーが起動しない
        icon: 🚫
        children:
          - label: サーバーを強制停止
            icon: ⏹️
            description: 前回のプロセスが残っている場合があります
            ref: stop_rails

          - label: コンテナを作り直す
            icon: 🐳
            ref: rebuild_container_no_cache
```

---

## 4. 非機能要件

### 4.1 対応環境

| 項目 | 要件 |
|------|------|
| VS Code バージョン | 1.85.0 以上 |
| Node.js | 18.x 以上 |
| 対応OS | Windows / macOS / Linux |
| Dev Container | 対応必須 |

### 4.2 パフォーマンス

| 項目 | 要件 |
|------|------|
| メニュー表示 | 500ms 以内 |
| YAML読み込み | 100ms 以内 |

### 4.3 保守性

| 項目 | 要件 |
|------|------|
| 拡張機能の変更 | メニュー追加時は不要（YAML編集のみ） |
| 設定のバリデーション | 起動時にエラー検出・通知 |

---

## 5. UI/UX 仕様

### 5.1 Phase 1: Quick Pick UI

```
┌──────────────────────────────────────┐
│ タスクメニュー                        │
├──────────────────────────────────────┤
│ 🗄️  DB操作                           │
│ 🐳  コンテナ操作                      │
│ 🚀  開発サーバー                      │
└──────────────────────────────────────┘
          ↓ 選択
┌──────────────────────────────────────┐
│ DB操作                               │
├──────────────────────────────────────┤
│ 🔄  リセット - DBを削除して再作成      │
│ 📦  マイグレーション                  │
│ 🌱  シード投入                        │
│ ← 戻る                               │
└──────────────────────────────────────┘
```

### 5.2 Phase 2: Webview UI（参考）

```
┌─────────────────────────────────┐
│  🔧 タスクメニュー              │
├─────────────────────────────────┤
│  ▼ DB操作                       │
│     ├─ 🔄 リセット       [実行] │
│     ├─ 📦 マイグレーション [実行] │
│     └─ 🌱 シード投入      [実行] │
│  ▶ コンテナ操作                 │
│  ▶ 開発サーバー                 │
└─────────────────────────────────┘
```

---

## 6. 開発計画

### Phase 1（MVP）

1. プロジェクト初期化（yo code）
2. YAML パーサー実装
3. Quick Pick UI 実装
4. ターミナル実行機能
5. VS Code コマンド実行機能
6. 設定リロード機能
7. テスト・デバッグ

### Phase 2（拡張）

1. Webview UI 実装
2. サイドバー統合
3. 複数アクション順次実行
4. 設定ファイルのGUIエディタ

---

## 7. 備考

### 7.1 参考資料
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Menu Builder（参考実装）](https://marketplace.visualstudio.com/items?itemName=kylpo.vscode-menu-builder)

### 7.2 想定リスク

| リスク | 対策 |
|--------|------|
| VS Code API 変更 | LTS バージョンに追従、年1回確認 |
| YAML パースエラー | バリデーション強化、エラーメッセージ明確化 |
