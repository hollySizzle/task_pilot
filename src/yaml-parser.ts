/**
 * TaskPilot YAML Parser
 * js-yamlを使用したYAML設定ファイルのパース機能
 */

import * as yaml from 'js-yaml';
import { MenuConfig, MenuItem, CommandDefinition, ValidationResult, ValidationError } from './types';

interface ValidationOptions {
    allowRef: boolean;
    refErrorMessage?: string;
}

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
        validateMenuItems(obj.menu, 'menu', errors, { allowRef: true });
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
 * taskPilot.globalMenu の設定値を検証
 */
export function validateGlobalMenu(data: unknown): { result: ValidationResult; menu?: MenuItem[] } {
    const errors: ValidationError[] = [];

    if (!Array.isArray(data)) {
        errors.push({ message: '"taskPilot.globalMenu" must be an array', path: 'taskPilot.globalMenu' });
        return { result: { valid: false, errors } };
    }

    validateMenuItems(data, 'taskPilot.globalMenu', errors, {
        allowRef: false,
        refErrorMessage: '"ref" is not supported in taskPilot.globalMenu'
    });

    if (errors.length > 0) {
        return { result: { valid: false, errors } };
    }

    return {
        result: { valid: true, errors: [] },
        menu: data as MenuItem[]
    };
}

/**
 * メニューアイテム配列を検証
 */
function validateMenuItems(
    items: unknown[],
    path: string,
    errors: ValidationError[],
    options: ValidationOptions
): void {
    items.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;

        if (!item || typeof item !== 'object') {
            errors.push({ message: 'Menu item must be an object', path: itemPath });
            return;
        }

        const menuItem = item as Record<string, unknown>;

        const hasChildren = menuItem.children !== undefined;
        const hasActions = menuItem.actions !== undefined;
        const hasParallel = menuItem.parallel !== undefined;
        const hasRef = menuItem.ref !== undefined;
        const hasType = menuItem.type !== undefined;
        const hasLabel = typeof menuItem.label === 'string';
        const hasActionShape = hasChildren || hasActions || hasParallel || hasRef || hasType;

        if (!hasLabel && !hasActionShape && (menuItem.version !== undefined || menuItem.menu !== undefined)) {
            const message = path === 'taskPilot.globalMenu'
                ? 'taskPilot.globalMenu expects the menu array itself; do not wrap it in a workspace config object with "version" or "menu"'
                : 'Menu item appears to be a workspace config object; use a menu item with "label" and an action shape';
            errors.push({ message, path: itemPath });
            return;
        }

        if (!hasLabel && !hasActionShape) {
            errors.push({
                message: 'Menu item must have "label" and one of "children", "actions", "parallel", "ref", or "type"',
                path: itemPath
            });
            return;
        }

        // label is required
        if (!hasLabel) {
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

        // category / actions / parallel branch では validateAction() に届かないため、
        // ここで ref を明示的に reject する。単独 action は validateAction() で評価される
        // ので二重報告を避けて除外する。
        if (
            menuItem.ref !== undefined &&
            !options.allowRef &&
            (hasChildren || hasActions || hasParallel)
        ) {
            errors.push({
                message: options.refErrorMessage || '"ref" is not allowed',
                path: `${itemPath}.ref`
            });
        }

        // children or action
        if (hasChildren) {
            if (!Array.isArray(menuItem.children)) {
                errors.push({ message: '"children" must be an array', path: `${itemPath}.children` });
            } else {
                validateMenuItems(menuItem.children, `${itemPath}.children`, errors, options);
            }
        } else if (hasActions) {
            // Multiple actions
            if (!Array.isArray(menuItem.actions)) {
                errors.push({ message: '"actions" must be an array', path: `${itemPath}.actions` });
            } else {
                validateActionsArray(menuItem.actions, `${itemPath}.actions`, errors, options);
            }
            // continueOnError validation
            if (menuItem.continueOnError !== undefined && typeof menuItem.continueOnError !== 'boolean') {
                errors.push({ message: '"continueOnError" must be a boolean', path: `${itemPath}.continueOnError` });
            }
        } else if (hasParallel) {
            // Parallel actions (split terminals)
            if (!Array.isArray(menuItem.parallel)) {
                errors.push({ message: '"parallel" must be an array', path: `${itemPath}.parallel` });
            } else {
                validateActionsArray(menuItem.parallel, `${itemPath}.parallel`, errors, options);
            }
        } else {
            // Must have ref or (type + command)
            validateAction(menuItem, itemPath, errors, options);
        }
    });
}

/**
 * actions配列を検証
 */
function validateActionsArray(
    actions: unknown[],
    path: string,
    errors: ValidationError[],
    options: ValidationOptions
): void {
    actions.forEach((action, index) => {
        const actionPath = `${path}[${index}]`;

        if (!action || typeof action !== 'object') {
            errors.push({ message: 'Action must be an object', path: actionPath });
            return;
        }

        const actionDef = action as Record<string, unknown>;
        validateActionDefinition(actionDef, actionPath, errors, options);
    });
}

/**
 * 個別のアクション定義を検証（actions配列内の要素用）
 */
function validateActionDefinition(
    item: Record<string, unknown>,
    path: string,
    errors: ValidationError[],
    options: ValidationOptions
): void {
    if (item.ref !== undefined) {
        if (typeof item.ref !== 'string') {
            errors.push({ message: '"ref" must be a string', path: `${path}.ref` });
        } else if (!options.allowRef) {
            errors.push({ message: options.refErrorMessage || '"ref" is not allowed', path: `${path}.ref` });
        }
        return;
    }

    // ref がない場合は type と command が必要
    if (!item.type) {
        errors.push({ message: 'Missing "type" or "ref" for action', path: `${path}.type` });
    } else if (!isValidActionType(item.type)) {
        errors.push({
            message: '"type" must be one of: terminal, shellCommand, vscodeCommand, task, openInDevContainer, openRemoteSSH, openRemoteTunnel',
            path: `${path}.type`
        });
    }

    // openInDevContainer/openRemoteSSH/openRemoteTunnel は path を使用、それ以外は command を使用
    if (item.type === 'openInDevContainer' || item.type === 'openRemoteSSH' || item.type === 'openRemoteTunnel') {
        if (!item.path || typeof item.path !== 'string') {
            errors.push({ message: 'Missing or invalid "path" field', path: `${path}.path` });
        }
        if (item.type === 'openRemoteSSH' && (!item.host || typeof item.host !== 'string')) {
            errors.push({ message: 'Missing or invalid "host" field', path: `${path}.host` });
        }
        if (item.type === 'openRemoteTunnel' && (!item.tunnelName || typeof item.tunnelName !== 'string')) {
            errors.push({ message: 'Missing or invalid "tunnelName" field', path: `${path}.tunnelName` });
        }
    } else if (!item.command || typeof item.command !== 'string') {
        errors.push({ message: 'Missing or invalid "command" field', path: `${path}.command` });
    }

    // terminal-specific validation
    if (item.type === 'terminal') {
        if (item.terminal !== undefined && typeof item.terminal !== 'string') {
            errors.push({ message: '"terminal" must be a string', path: `${path}.terminal` });
        }
    }

    // local shell command validation
    if (item.type === 'terminal' || item.type === 'shellCommand') {
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
function validateAction(
    item: Record<string, unknown>,
    path: string,
    errors: ValidationError[],
    options: ValidationOptions
): void {
    if (item.ref !== undefined) {
        if (typeof item.ref !== 'string') {
            errors.push({ message: '"ref" must be a string', path: `${path}.ref` });
        } else if (!options.allowRef) {
            errors.push({ message: options.refErrorMessage || '"ref" is not allowed', path: `${path}.ref` });
        }
        // ref がある場合は type/command は不要
        return;
    }

    // ref がない場合は type と command が必要
    if (!item.type) {
        errors.push({ message: 'Missing "type" or "ref" for action item', path: `${path}.type` });
    } else if (!isValidActionType(item.type)) {
        errors.push({
            message: '"type" must be one of: terminal, shellCommand, vscodeCommand, task, openInDevContainer, openRemoteSSH, openRemoteTunnel',
            path: `${path}.type`
        });
    }

    // openInDevContainer/openRemoteSSH/openRemoteTunnel は path を使用、それ以外は command を使用
    if (item.type === 'openInDevContainer' || item.type === 'openRemoteSSH' || item.type === 'openRemoteTunnel') {
        if (!item.path || typeof item.path !== 'string') {
            errors.push({ message: 'Missing or invalid "path" field', path: `${path}.path` });
        }
        if (item.type === 'openRemoteSSH' && (!item.host || typeof item.host !== 'string')) {
            errors.push({ message: 'Missing or invalid "host" field', path: `${path}.host` });
        }
        if (item.type === 'openRemoteTunnel' && (!item.tunnelName || typeof item.tunnelName !== 'string')) {
            errors.push({ message: 'Missing or invalid "tunnelName" field', path: `${path}.tunnelName` });
        }
    } else if (!item.command || typeof item.command !== 'string') {
        errors.push({ message: 'Missing or invalid "command" field', path: `${path}.command` });
    }

    // terminal-specific validation
    if (item.type === 'terminal') {
        if (item.terminal !== undefined && typeof item.terminal !== 'string') {
            errors.push({ message: '"terminal" must be a string', path: `${path}.terminal` });
        }
    }

    // local shell command validation
    if (item.type === 'terminal' || item.type === 'shellCommand') {
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
function isValidActionType(type: unknown): type is 'terminal' | 'shellCommand' | 'vscodeCommand' | 'task' | 'openInDevContainer' | 'openRemoteSSH' | 'openRemoteTunnel' {
    return type === 'terminal' || type === 'shellCommand' || type === 'vscodeCommand' || type === 'task' || type === 'openInDevContainer' || type === 'openRemoteSSH' || type === 'openRemoteTunnel';
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
                message: '"type" must be one of: terminal, shellCommand, vscodeCommand, task, openInDevContainer, openRemoteSSH, openRemoteTunnel',
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
