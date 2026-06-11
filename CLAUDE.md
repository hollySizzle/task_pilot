# Claude Code Router

Claude Code セッションの tool-specific 入口。Claude Code は本ファイルを native に読む。共通の central preset rules は `${MOZYO_BRIDGE_HOME:-~/.mozyo_bridge}/rules/presets/redmine-governed/agent-workflow.md` を正本とし、router 本文には複製しない。AGENTS.md (Codex tool-specific) を import しない。

## セッション開始

1. 現在の working directory がこの project root またはその配下であることを確認する。
2. mozyo-bridge の central preset rules を読む:
   - committed docs では portable 表記 `${MOZYO_BRIDGE_HOME:-~/.mozyo_bridge}/rules/presets/redmine-governed/agent-workflow.md` を使う。
   - runtime で実ファイルを読む際は `mozyo-bridge rules home --resolved` の出力に `/rules/presets/redmine-governed/agent-workflow.md` を連結した絶対 path を読む。`--resolved` 出力は debug / runtime 用で、committed docs に貼らない。
   - resolved path や central preset を読めない場合は、読んだふりをせず停止し、`mozyo-bridge rules install` 等の復旧を operator に求める。
3. 非自明な作業を始める前に active な `Redmine issue / journal と project docs` を確認する。

`${MOZYO_BRIDGE_HOME:-~/.mozyo_bridge}/rules/presets/redmine-governed/agent-workflow.md` が存在しない場合は、読んだふりをせず停止し、operator に `mozyo-bridge rules install` を依頼する。

## ClaudeCode 起動時の最小 reminder

- 迎合せず事実に基づいて結論を述べる。意見の不一致は `${MOZYO_BRIDGE_HOME:-~/.mozyo_bridge}/rules/presets/redmine-governed/agent-workflow.md` が指定する durable record に残す。
- implementation done / implementation_done は completion ではない。review / audit / close 条件は `${MOZYO_BRIDGE_HOME:-~/.mozyo_bridge}/rules/presets/redmine-governed/agent-workflow.md` に従う。
- pane 通知は通知でしかない。判断の正本は `${MOZYO_BRIDGE_HOME:-~/.mozyo_bridge}/rules/presets/redmine-governed/agent-workflow.md` と active な `Redmine issue / journal と project docs` を読む。
- handoff を送る場合は `${MOZYO_BRIDGE_HOME:-~/.mozyo_bridge}/rules/presets/redmine-governed/agent-workflow.md` の handoff startup decision / receive-method rule に従い、受領方法を durable record に残す。
- `mozyo-bridge status` / `mozyo-bridge doctor` / pane scrollback は operator/debug 用。durable anchor が利用可能なときに、それらから receiver state や ticket state を推測しない。
- handoff chat は state + durable anchor の最小ポインタにとどめる。受領方法・retry 計画・試行コマンドは durable record 側に置き、chat に貼り直さない。
- 詳細・例外・gate templates は `${MOZYO_BRIDGE_HOME:-~/.mozyo_bridge}/rules/presets/redmine-governed/agent-workflow.md` を読む。router に重複させない。

## Project-Local Additions

<!-- mozyo-bridge:project-local-additions:begin -->
<!--
このマーカー間は `mozyo-bridge scaffold apply` / `scaffold diff` で機械的に保持されます。
ClaudeCode 起動時に project-local で必ず思い出してほしい reminder (危険 command、
Doc-readonly 領域、project 固有 role boundary override 等) をここに追記してください。
マーカー外の内容は scaffold 再生成で上書きされます。
-->

### Codex Review 適用範囲 (owner 採択 2026-06-11, Redmine #11607)

central preset の Review Gate を本 project では以下の範囲で運用する。

```yaml
codex_review_required:
  - src/**
  - package.json の contributes / engines / activationEvents
  - schemas/**
  - .github/workflows/**  # 遡及レビューで publish.yml に High が出た実績による格上げ (owner 採択 2026-06-11, #11548 review #55769)
lightweight_gate:  # implementation_done + owner close approval のみで close 可
  - docs / README / CHANGELOG のみの変更
  - l10n 文言のみの変更
  - CLAUDE.md 等ガードレールのみの変更
共通:
  - review 省略は per-issue journal に owner 指示を記録した場合に限る。省略をデフォルト化しない
  - 軽量ゲートでも owner close approval journal は省略しない
```
<!-- mozyo-bridge:project-local-additions:end -->
