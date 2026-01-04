/**
 * TaskPilot Config Editor - Webview JavaScript
 *
 * UMD pattern for Node.js/Jest and browser compatibility
 */
(function(root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        // Node.js/CommonJS
        module.exports = factory();
    } else {
        // Browser
        root.EditorLogic = factory();
    }
})(typeof window !== 'undefined' ? window : this, function() {
    'use strict';

    /**
     * HTML特殊文字をエスケープ
     * @param {string} text - エスケープする文字列
     * @returns {string} エスケープされた文字列
     */
    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * パスからメニューアイテムを取得
     * @param {Array} items - メニューアイテム配列
     * @param {number[]} path - インデックスパス
     * @returns {Object|null} 見つかったアイテム、または null
     */
    function getItemAtPath(items, path) {
        if (!items || !path || path.length === 0) return null;
        const index = path[0];
        if (index < 0 || index >= items.length) return null;
        const item = items[index];
        if (path.length === 1) return item;
        return getItemAtPath(item.children, path.slice(1));
    }

    /**
     * メニューアイテムのHTMLをレンダリング
     * @param {Array} items - メニューアイテム配列
     * @param {number[]} path - 現在のパス
     * @param {Function} escapeHtmlFn - エスケープ関数
     * @returns {string} 生成されたHTML
     */
    function renderMenuItems(items, path, escapeHtmlFn) {
        const escape = escapeHtmlFn || escapeHtml;
        return items.map((item, index) => {
            const itemPath = [...path, index];
            const pathStr = JSON.stringify(itemPath);
            const hasChildren = item.children && item.children.length > 0;
            const icon = item.icon || (hasChildren ? '📁' : '💻');
            const typeBadge = item.ref ? 'ref: ' + item.ref : (item.type || 'category');

            let html = '<div class="menu-item" draggable="true" data-path="' + pathStr + '">' +
                '<span class="drag-handle">⋮⋮</span>' +
                '<span class="icon">' + escape(icon) + '</span>' +
                '<span class="label">' + escape(item.label) + '</span>' +
                '<span class="type-badge">' + typeBadge + '</span>' +
                '<div class="actions">' +
                    '<button onclick="editItem(' + pathStr + ')">Edit</button>';

            if (hasChildren) {
                html += '<button onclick="addChildItem(' + pathStr + ')">Add Child</button>';
            }

            html += '<button class="delete" onclick="deleteItem(' + pathStr + ')">Delete</button>' +
                '</div></div>';

            if (hasChildren) {
                html += '<div class="children">' + renderMenuItems(item.children, itemPath, escape) + '</div>';
            }

            return html;
        }).join('');
    }

    /**
     * コマンドリストのHTMLをレンダリング
     * @param {Object} commands - コマンド定義オブジェクト
     * @param {Function} escapeHtmlFn - エスケープ関数
     * @returns {string} 生成されたHTML
     */
    function renderCommands(commands, escapeHtmlFn) {
        const escape = escapeHtmlFn || escapeHtml;
        if (!commands || Object.keys(commands).length === 0) {
            return '<div class="empty-state">No commands defined</div>';
        }

        return Object.entries(commands).map(function(entry) {
            var name = entry[0];
            var cmd = entry[1];
            return '<div class="menu-item">' +
                '<span class="icon">📦</span>' +
                '<span class="label">' + escape(name) + '</span>' +
                '<span class="type-badge">' + cmd.type + '</span>' +
                '<span style="color: var(--vscode-descriptionForeground); font-size: 12px;">' + escape(cmd.command) + '</span>' +
                '<div class="actions">' +
                    '<button onclick="editCommand(\'' + escape(name) + '\')">Edit</button>' +
                    '<button class="delete" onclick="deleteCommand(\'' + escape(name) + '\')">Delete</button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    /**
     * フォームからアイテムデータを構築
     * @param {Object} formData - フォームデータ
     * @returns {Object} メニューアイテム
     */
    function buildItemFromForm(formData) {
        var item = {
            label: formData.label
        };

        if (formData.icon) {
            item.icon = formData.icon;
        }

        if (formData.type === 'ref') {
            item.ref = formData.ref;
        } else if (formData.type && formData.type !== '') {
            item.type = formData.type;
            item.command = formData.command;

            if (formData.type === 'terminal') {
                if (formData.terminal) item.terminal = formData.terminal;
                if (formData.cwd) item.cwd = formData.cwd;
            }
        }

        return item;
    }

    /**
     * アイテムタイプを判定
     * @param {Object} item - メニューアイテム
     * @returns {string} タイプ文字列
     */
    function determineItemType(item) {
        if (item.ref) {
            return 'ref';
        } else if (item.children && item.children.length > 0) {
            return '';
        } else {
            return item.type || '';
        }
    }

    /**
     * フォームフィールドの表示/非表示を判定
     * @param {string} type - アイテムタイプ
     * @returns {Object} 表示状態オブジェクト
     */
    function getFormFieldVisibility(type) {
        var isActionType = type !== 'ref' && type !== '' && !!type;
        return {
            showActionFields: isActionType,
            showRefField: type === 'ref',
            showTerminalFields: type === 'terminal'
        };
    }

    /**
     * 子追加用のパスを計算
     * @param {number[]} parentPath - 親パス
     * @param {Array} items - メニューアイテム配列
     * @returns {number[]} 新しい子アイテムのパス
     */
    function calculateChildPath(parentPath, items) {
        if (!parentPath || parentPath.length === 0) {
            return [items ? items.length : 0];
        }

        var parentItem = getItemAtPath(items, parentPath);
        if (parentItem) {
            var childCount = (parentItem.children || []).length;
            return parentPath.concat([childCount]);
        }
        return parentPath.concat([0]);
    }

    /**
     * ドラッグソースとターゲットが同じか判定
     * @param {number[]} fromPath - ソースパス
     * @param {number[]} toPath - ターゲットパス
     * @returns {boolean} 同じ場合true
     */
    function isSamePath(fromPath, toPath) {
        if (!fromPath || !toPath) return false;
        if (fromPath.length !== toPath.length) return false;
        return fromPath.every(function(v, i) {
            return v === toPath[i];
        });
    }

    // Public API
    return {
        escapeHtml: escapeHtml,
        getItemAtPath: getItemAtPath,
        renderMenuItems: renderMenuItems,
        renderCommands: renderCommands,
        buildItemFromForm: buildItemFromForm,
        determineItemType: determineItemType,
        getFormFieldVisibility: getFormFieldVisibility,
        calculateChildPath: calculateChildPath,
        isSamePath: isSamePath
    };
});
