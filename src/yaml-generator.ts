/**
 * TaskPilot YAML Generator
 * MenuConfig から YAML 文字列を生成する機能
 */

import * as yaml from 'js-yaml';
import { MenuConfig, MenuItem, CommandDefinition, ActionDefinition } from './types';

/**
 * MenuConfigをYAML文字列に変換
 * @param config 設定オブジェクト
 * @returns YAML文字列
 */
export function generateYaml(config: MenuConfig): string {
    const lines: string[] = [];

    // version
    lines.push(`version: "${config.version}"`);
    lines.push('');

    // commands (optional)
    if (config.commands && Object.keys(config.commands).length > 0) {
        lines.push('commands:');
        for (const [name, cmd] of Object.entries(config.commands)) {
            lines.push(...generateCommandYaml(name, cmd, 1));
        }
        lines.push('');
    }

    // menu
    if (config.menu.length === 0) {
        lines.push('menu: []');
    } else {
        lines.push('menu:');
        for (const item of config.menu) {
            lines.push(...generateMenuItemYamlLines(item, 1));
        }
    }

    return lines.join('\n');
}

/**
 * CommandDefinitionをYAML行配列に変換
 */
function generateCommandYaml(name: string, cmd: CommandDefinition, indent: number): string[] {
    const prefix = '  '.repeat(indent);
    const lines: string[] = [];

    lines.push(`${prefix}${name}:`);
    lines.push(`${prefix}  type: ${cmd.type}`);
    lines.push(`${prefix}  command: ${escapeYamlString(cmd.command)}`);

    if (cmd.description) {
        lines.push(`${prefix}  description: ${escapeYamlString(cmd.description)}`);
    }
    if (cmd.terminal) {
        lines.push(`${prefix}  terminal: ${escapeYamlString(cmd.terminal)}`);
    }
    if (cmd.cwd) {
        lines.push(`${prefix}  cwd: ${escapeYamlString(cmd.cwd)}`);
    }
    if (cmd.args && cmd.args.length > 0) {
        lines.push(`${prefix}  args:`);
        for (const arg of cmd.args) {
            lines.push(`${prefix}    - ${formatYamlValue(arg)}`);
        }
    }

    return lines;
}

/**
 * MenuItemをYAML行配列に変換（内部用）
 */
function generateMenuItemYamlLines(item: MenuItem, indent: number): string[] {
    const prefix = '  '.repeat(indent);
    const lines: string[] = [];

    // リストアイテムとしてlabelを出力
    lines.push(`${prefix}- label: ${escapeYamlString(item.label)}`);
    const contentPrefix = prefix + '  ';

    // icon
    if (item.icon) {
        lines.push(`${contentPrefix}icon: ${escapeYamlString(item.icon)}`);
    }

    // description
    if (item.description) {
        lines.push(`${contentPrefix}description: ${escapeYamlString(item.description)}`);
    }

    // children (ネストしたメニュー)
    if (item.children && item.children.length > 0) {
        lines.push(`${contentPrefix}children:`);
        for (const child of item.children) {
            lines.push(...generateMenuItemYamlLines(child, indent + 2));
        }
    } else if (item.actions && item.actions.length > 0) {
        // multiple actions
        lines.push(`${contentPrefix}actions:`);
        for (const action of item.actions) {
            lines.push(...generateActionDefinitionYaml(action, indent + 2));
        }
        if (item.continueOnError !== undefined) {
            lines.push(`${contentPrefix}continueOnError: ${item.continueOnError}`);
        }
    } else if (item.ref) {
        // ref reference
        lines.push(`${contentPrefix}ref: ${item.ref}`);
    } else if (item.type && item.command) {
        // inline action
        lines.push(`${contentPrefix}type: ${item.type}`);
        lines.push(`${contentPrefix}command: ${escapeYamlString(item.command)}`);

        if (item.terminal) {
            lines.push(`${contentPrefix}terminal: ${escapeYamlString(item.terminal)}`);
        }
        if (item.cwd) {
            lines.push(`${contentPrefix}cwd: ${escapeYamlString(item.cwd)}`);
        }
        if (item.args && item.args.length > 0) {
            lines.push(`${contentPrefix}args:`);
            for (const arg of item.args) {
                lines.push(`${contentPrefix}  - ${formatYamlValue(arg)}`);
            }
        }
    }

    return lines;
}

/**
 * ActionDefinitionをYAML行配列に変換
 */
function generateActionDefinitionYaml(action: ActionDefinition, indent: number): string[] {
    const prefix = '  '.repeat(indent);
    const lines: string[] = [];

    if (action.ref) {
        lines.push(`${prefix}- ref: ${action.ref}`);
    } else if (action.type && action.command) {
        lines.push(`${prefix}- type: ${action.type}`);
        const contentPrefix = prefix + '  ';
        lines.push(`${contentPrefix}command: ${escapeYamlString(action.command)}`);

        if (action.description) {
            lines.push(`${contentPrefix}description: ${escapeYamlString(action.description)}`);
        }
        if (action.terminal) {
            lines.push(`${contentPrefix}terminal: ${escapeYamlString(action.terminal)}`);
        }
        if (action.cwd) {
            lines.push(`${contentPrefix}cwd: ${escapeYamlString(action.cwd)}`);
        }
        if (action.args && action.args.length > 0) {
            lines.push(`${contentPrefix}args:`);
            for (const arg of action.args) {
                lines.push(`${contentPrefix}  - ${formatYamlValue(arg)}`);
            }
        }
    }

    return lines;
}

/**
 * MenuItemをYAML文字列に変換（公開API）
 * @param item メニューアイテム
 * @param indent インデントレベル
 * @returns YAML文字列
 */
export function generateMenuItemYaml(item: MenuItem, indent: number): string {
    return generateMenuItemYamlLines(item, indent).join('\n');
}

/**
 * YAML値をフォーマット
 */
function formatYamlValue(value: unknown): string {
    if (typeof value === 'string') {
        return escapeYamlString(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (value === null || value === undefined) {
        return 'null';
    }
    // オブジェクトや配列はjs-yamlでダンプ
    return yaml.dump(value, { flowLevel: 0 }).trim();
}

/**
 * YAML文字列をエスケープ（必要な場合のみクォート）
 */
function escapeYamlString(str: string): string {
    // 特殊文字や予約語を含む場合はクォートする
    const needsQuotes = /[:#\[\]{}|>&*!?'"`\n\r]/.test(str) ||
        str.startsWith(' ') ||
        str.endsWith(' ') ||
        str === 'true' ||
        str === 'false' ||
        str === 'null' ||
        str === 'yes' ||
        str === 'no' ||
        /^\d+(\.\d+)?$/.test(str);

    if (needsQuotes) {
        // ダブルクォートでエスケープ
        return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    }

    return str;
}
