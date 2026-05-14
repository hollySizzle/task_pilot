# globalMenu の現行制約メモ

## 対象

- `taskPilot.globalMenu` を user settings 側の配布面として使う前提で、現行の `task-menu.yaml` との差分と export 実装前提を整理する。

## 結論

- 現在の `globalMenu` は `MenuItem` 完全互換ではない。
- 特に `commands` を持たないため、`ref` を安定して扱う土台がない。
- merge 後の `MenuConfig` をそのまま編集・保存する設計のため、workspace menu と globalMenu の出自を保持できていない。
- `task-menu.yaml -> taskPilot.globalMenu` の export を安全に入れるには、先に schema/runtime の整合と出自保持を整備する必要がある。

## 現状差分

| 観点 | `task-menu.yaml` | `taskPilot.globalMenu` |
| --- | --- | --- |
| ルート構造 | `MenuConfig` (`version`, `commands`, `menu`) | `MenuItem[]` のみ |
| 検証経路 | `parseMenuConfig()` で YAML parse + 独自 validation | VS Code settings schema のみ。独自 validation なし |
| `ref` | `commands` を参照可能 | 設定項目に `commands` がなく、安定した参照先がない |
| `actions` / `parallel` | 型・validator・runtime あり | settings schema に露出していない |
| `args` / `continueOnError` | 型・validator・runtime あり | settings schema に露出していない |
| menu merge | なし | workspace menu の後ろに追加。重複時は workspace 優先 |
| 出自情報 | workspace config のみ | merge 後は global 由来か判別できない |

## 実装上の制約

### 1. globalMenu は `commands` を持てない

- `getGlobalMenu()` は `taskPilot.globalMenu` を `MenuItem[]` として直接読む。
- `getConfig()` は workspace config がない場合、`{ version: "1.0", menu: globalMenu }` を仮想的に返すだけで `commands` は作らない。
- `resolveAction()` / `resolveActionDefinition()` の `ref` 解決先は常に `this.config?.commands`。

影響:

- global-only 環境では `ref` は必ず解決不能。
- workspace config がある場合に限り、global item の `ref` が workspace `commands` に偶然ぶら下がる余地はあるが、仕様としては不安定。
- export で `ref` を残すかどうかは別チケットで明示決定が必要。

### 2. settings schema が `MenuItem` に追随していない

- `package.json` の `taskPilot.globalMenu` は `label`, `icon`, `description`, `type`, `command`, `terminal`, `cwd`, `path`, `host`, `tunnelName`, `children`, `actions`, `parallel`, `args`, `continueOnError` を露出している (2026-05-13 時点)。
- schema 側で `ref` を明示的に reject する (`not: { required: ["ref"] }`) ことで、Settings UI から invalid object が保存できないようにしている。
- 各 item は `children` / `actions` / `parallel` / `type` のいずれかを持つことを `anyOf` で要求する。これにより `label` だけの空 item が schema 上も runtime 上も同じく reject される。
- `actions[]` / `parallel[]` 内の action item も `required: ["type"]` と `not: { required: ["ref"] }` を持ち、runtime の `validateActionDefinition` と挙動を揃えている。

影響:

- schema/runtime parity が取れたので、Settings UI で保存できる値は runtime の `validateGlobalMenu` も通る前提を維持する。
- 将来 `ref` の取り扱いを変える場合は、schema と runtime の両方を同時に更新する必要がある (parity test が drift を検知する)。

### 3. merge はトップレベルの `label` だけで衝突判定している

- `mergeMenus()` は workspace menu のトップレベル `label` を `Set` 化し、同名の global item を丸ごと落とす。
- `children` の再帰 merge はしない。
- 判定キーは `label` だけで、`type`, `command`, `path`, `host` などは見ない。

影響:

- 同名だが意味の違うグローバル項目を共存できない。
- カテゴリ同士の統合も、配下 children の merge もできない。
- 衝突解決ルールの見直しチケットは、この実装を置き換える前提で進める必要がある。

### 4. globalMenu は workspace 非依存の見た目だが、実行時は workspace 文脈に依存する

- `shellCommand` の `cwd` は `resolveCwd()` で現在の workspace ルート基準に解決される。
- `terminal` の `cwd` も terminal 作成時に workspace 文脈へ依存する。
- `configPath` も先頭 workspace folder 基準。

影響:

- globalMenu を「全ワークスペース共通」と見せても、相対 `cwd` を含む項目は開いている workspace に依存する。
- export 仕様では、相対 `cwd` をそのまま許容するか、警告対象にするかを決める必要がある。

### 5. Config Editor は merge 後の設定を workspace YAML へ保存する

- `ConfigEditorPanel` は初期表示と refresh に `getConfig()` を使う。
- save 時はその `_currentConfig` 全体を `generateYaml()` で YAML 化し、`configPath` へ書き戻す。
- Export Global Menu ボタンは `_currentConfig` を `taskPilot.exportGlobalMenu` の引数として渡す。command 側は引数があればそれを source に、無ければ保存済み workspace YAML を source にして export する。

影響:

- globalMenu を含んだ merged config を開いて save すると、global item が workspace YAML へ流れ込む。
- global と workspace の境界を保ったまま編集する UI ではない。
- Export Global Menu ボタン経由の export は editor 上の未保存編集を反映する。Command Palette / Sidebar から直接 invoke した場合は従来通り保存済み YAML を source にする (override 引数を持たないため)。

## export 実装の前提条件

1. `globalMenu` schema/runtime を `MenuItem` に近づける
2. raw workspace config と raw globalMenu を別々に取得できる API を使う
3. merge 後データに出自を混ぜない
4. `ref` は仕様決定まで export 対象外にするか、明示エラーにする
5. 衝突時の扱いを `label` 一発判定から再定義する

## 推奨する進行順

1. `globalMenu` の schema/runtime を `MenuItem` に揃える
2. `ref` の扱いを仕様決定する
3. raw データを使う export コマンドを追加する
4. merge / collision rule を見直す

## 補足

- 現行の merge 実装は「workspace を優先しつつ global を後ろに足す」だけなので、閲覧用途としては単純で分かりやすい。
- ただし export・編集・仕様互換まで含めると、この単純さの代償として source provenance を失っている。
