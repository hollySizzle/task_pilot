/**
 * TaskPilot YAML Parser
 * js-yamlを使用したYAML設定ファイルのパース機能
 */

import * as yaml from 'js-yaml';
import { MenuConfig, MenuItem, CommandDefinition, ValidationResult, ValidationError } from './types';

/**
 * YAMLパースエラー（行番号付き）
 */
export class YamlParseError extends Error {
    constructor(
        message: string,
        public readonly line?: number,
        public readonly column?: number
    ) {
        super(line ? `Line ${line}: ${message}` : message);
        this.name = 'YamlParseError';
    }
}

/**
 * YAMLコンテンツをパースしてMenuConfigを返す
 * @param content YAMLコンテンツ文字列
 * @returns パース結果
 * @throws YamlParseError パース失敗時
 */
export function parseYaml(content: string): unknown {
    try {
        return yaml.load(content);
    } catch (error) {
        if (error instanceof yaml.YAMLException) {
            const mark = error.mark;
            throw new YamlParseError(
                error.reason || 'Invalid YAML syntax',
                mark?.line !== undefined ? mark.line + 1 : undefined,
                mark?.column !== undefined ? mark.column + 1 : undefined
            );
        }
        throw new YamlParseError(
            error instanceof Error ? error.message : 'Unknown parse error'
        );
    }
}

/**
 * パース結果をMenuConfig型として検証・変換
 * @param data パースされたデータ
 * @returns バリデーション結果と設定
 */
export function validateConfig(data: unknown): { result: ValidationResult; config?: MenuConfig } {
    const errors: ValidationError[] = [];

    if (!data || typeof data !== 'object') {
        errors.push({ message: 'Configuration must be an object' });
        return { result: { valid: false, errors } };
    }

    const obj = data as Record<string, unknown>;

    // version check
    if (!obj.version || typeof obj.version !== 'string') {
        errors.push({ message: 'Missing or invalid "version" field', path: 'version' });
    }

    // menu check
    if (!obj.menu) {
        errors.push({ message: 'Missing "menu" field', path: 'menu' });
    } else if (!Array.isArray(obj.menu)) {
        errors.push({ message: '"menu" must be an array', path: 'menu' });
    } else {
        validateMenuItems(obj.menu, 'menu', errors);
    }

    // commands check (optional)
    if (obj.commands !== undefined) {
        if (typeof obj.commands !== 'object' || Array.isArray(obj.commands)) {
            errors.push({ message: '"commands" must be an object', path: 'commands' });
        } else {
            validateCommands(obj.commands as Record<string, unknown>, errors);
        }
    }

    if (errors.length > 0) {
        return { result: { valid: false, errors } };
    }

    return {
        result: { valid: true, errors: [] },
        config: obj as unknown as MenuConfig
    };
}

/**
 * メニューアイテム配列を検証
 */
function validateMenuItems(items: unknown[], path: string, errors: ValidationError[]): void {
    items.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;

        if (!item || typeof item !== 'object') {
            errors.push({ message: 'Menu item must be an object', path: itemPath });
            return;
        }

        const menuItem = item as Record<string, unknown>;

        // label is required
        if (!menuItem.label || typeof menuItem.label !== 'string') {
            errors.push({ message: 'Missing or invalid "label" field', path: `${itemPath}.label` });
        }

        // icon validation
        if (menuItem.icon !== undefined && typeof menuItem.icon !== 'string') {
            errors.push({ message: '"icon" must be a string', path: `${itemPath}.icon` });
        }

        // description validation
        if (menuItem.description !== undefined && typeof menuItem.description !== 'string') {
            errors.push({ message: '"description" must be a string', path: `${itemPath}.description` });
        }

        // children or action
        if (menuItem.children !== undefined) {
            if (!Array.isArray(menuItem.children)) {
                errors.push({ message: '"children" must be an array', path: `${itemPath}.children` });
            } else {
                validateMenuItems(menuItem.children, `${itemPath}.children`, errors);
            }
        } else if (menuItem.actions !== undefined) {
            // Multiple actions
            if (!Array.isArray(menuItem.actions)) {
                errors.push({ message: '"actions" must be an array', path: `${itemPath}.actions` });
            } else {
                validateActionsArray(menuItem.actions, `${itemPath}.actions`, errors);
            }
            // continueOnError validation
            if (menuItem.continueOnError !== undefined && typeof menuItem.continueOnError !== 'boolean') {
                errors.push({ message: '"continueOnError" must be a boolean', path: `${itemPath}.continueOnError` });
            }
        } else if (menuItem.parallel !== undefined) {
            // Parallel actions (split terminals)
            if (!Array.isArray(menuItem.parallel)) {
                errors.push({ message: '"parallel" must be an array', path: `${itemPath}.parallel` });
            } else {
                validateActionsArray(menuItem.parallel, `${itemPath}.parallel`, errors);
            }
        } else {
            // Must have ref or (type + command)
            validateAction(menuItem, itemPath, errors);
        }
    });
}

/**
 * actions配列を検証
 */
function validateActionsArray(actions: unknown[], path: string, errors: ValidationError[]): void {
    actions.forEach((action, index) => {
        const actionPath = `${path}[${index}]`;

        if (!action || typeof action !== 'object') {
            errors.push({ message: 'Action must be an object', path: actionPath });
            return;
        }

        const actionDef = action as Record<string, unknown>;
        validateActionDefinition(actionDef, actionPath, errors);
    });
}

/**
 * 個別のアクション定義を検証（actions配列内の要素用）
 */
function validateActionDefinition(item: Record<string, unknown>, path: string, errors: ValidationError[]): void {
    if (item.ref !== undefined) {
        if (typeof item.ref !== 'string') {
            errors.push({ message: '"ref" must be a string', path: `${path}.ref` });
        }
        return;
    }

    // ref がない場合は type と command が必要
    if (!item.type) {
        errors.push({ message: 'Missing "type" or "ref" for action', path: `${path}.type` });
    } else if (!isValidActionType(item.type)) {
        errors.push({
            message: '"type" must be one of: terminal, vscodeCommand, task',
            path: `${path}.type`
        });
    }

    if (!item.command || typeof item.command !== 'string') {
        errors.push({ message: 'Missing or invalid "command" field', path: `${path}.command` });
    }

    // terminal-specific validation
    if (item.type === 'terminal') {
        if (item.terminal !== undefined && typeof item.terminal !== 'string') {
            errors.push({ message: '"terminal" must be a string', path: `${path}.terminal` });
        }
        if (item.cwd !== undefined && typeof item.cwd !== 'string') {
            errors.push({ message: '"cwd" must be a string', path: `${path}.cwd` });
        }
    }

    // vscodeCommand-specific validation
    if (item.type === 'vscodeCommand') {
        if (item.args !== undefined && !Array.isArray(item.args)) {
            errors.push({ message: '"args" must be an array', path: `${path}.args` });
        }
    }
}

/**
 * アクション定義を検証
 */
function validateAction(item: Record<string, unknown>, path: string, errors: ValidationError[]): void {
    if (item.ref !== undefined) {
        if (typeof item.ref !== 'string') {
            errors.push({ message: '"ref" must be a string', path: `${path}.ref` });
        }
        // ref がある場合は type/command は不要
        return;
    }

    // ref がない場合は type と command が必要
    if (!item.type) {
        errors.push({ message: 'Missing "type" or "ref" for action item', path: `${path}.type` });
    } else if (!isValidActionType(item.type)) {
        errors.push({
            message: '"type" must be one of: terminal, vscodeCommand, task',
            path: `${path}.type`
        });
    }

    if (!item.command || typeof item.command !== 'string') {
        errors.push({ message: 'Missing or invalid "command" field', path: `${path}.command` });
    }

    // terminal-specific validation
    if (item.type === 'terminal') {
        if (item.terminal !== undefined && typeof item.terminal !== 'string') {
            errors.push({ message: '"terminal" must be a string', path: `${path}.terminal` });
        }
        if (item.cwd !== undefined && typeof item.cwd !== 'string') {
            errors.push({ message: '"cwd" must be a string', path: `${path}.cwd` });
        }
    }

    // vscodeCommand-specific validation
    if (item.type === 'vscodeCommand') {
        if (item.args !== undefined && !Array.isArray(item.args)) {
            errors.push({ message: '"args" must be an array', path: `${path}.args` });
        }
    }
}

/**
 * アクションタイプが有効かチェック
 */
function isValidActionType(type: unknown): type is 'terminal' | 'vscodeCommand' | 'task' {
    return type === 'terminal' || type === 'vscodeCommand' || type === 'task';
}

/**
 * コマンド定義を検証
 */
function validateCommands(commands: Record<string, unknown>, errors: ValidationError[]): void {
    for (const [name, cmd] of Object.entries(commands)) {
        const path = `commands.${name}`;

        if (!cmd || typeof cmd !== 'object') {
            errors.push({ message: 'Command definition must be an object', path });
            continue;
        }

        const cmdDef = cmd as Record<string, unknown>;

        if (!cmdDef.type) {
            errors.push({ message: 'Missing "type" field', path: `${path}.type` });
        } else if (!isValidActionType(cmdDef.type)) {
            errors.push({
                message: '"type" must be one of: terminal, vscodeCommand, task',
                path: `${path}.type`
            });
        }

        if (!cmdDef.command || typeof cmdDef.command !== 'string') {
            errors.push({ message: 'Missing or invalid "command" field', path: `${path}.command` });
        }
    }
}

/**
 * YAMLコンテンツをパースしてMenuConfigとして返す
 * @param content YAMLコンテンツ文字列
 * @returns パースされた設定
 * @throws YamlParseError パース/バリデーション失敗時
 */
export function parseMenuConfig(content: string): MenuConfig {
    const data = parseYaml(content);
    const { result, config } = validateConfig(data);

    if (!result.valid || !config) {
        const errorMessages = result.errors
            .map(e => e.path ? `${e.path}: ${e.message}` : e.message)
            .join('\n');
        throw new YamlParseError(`Configuration validation failed:\n${errorMessages}`);
    }

    return config;
}
