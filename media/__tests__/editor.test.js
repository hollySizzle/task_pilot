/**
 * TaskPilot Config Editor - Webview JavaScript Tests
 */

const EditorLogic = require('../editor.js');

describe('EditorLogic', () => {
    describe('escapeHtml', () => {
        it('should return empty string for null/undefined', () => {
            expect(EditorLogic.escapeHtml(null)).toBe('');
            expect(EditorLogic.escapeHtml(undefined)).toBe('');
            expect(EditorLogic.escapeHtml('')).toBe('');
        });

        it('should escape HTML special characters', () => {
            expect(EditorLogic.escapeHtml('<script>')).toBe('&lt;script&gt;');
            expect(EditorLogic.escapeHtml('a & b')).toBe('a &amp; b');
            expect(EditorLogic.escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
        });

        it('should handle mixed content', () => {
            expect(EditorLogic.escapeHtml('<div class="test">Hello & goodbye</div>'))
                .toBe('&lt;div class=&quot;test&quot;&gt;Hello &amp; goodbye&lt;/div&gt;');
        });

        it('should not escape already safe text', () => {
            expect(EditorLogic.escapeHtml('Hello World')).toBe('Hello World');
            expect(EditorLogic.escapeHtml('123')).toBe('123');
        });
    });

    describe('getItemAtPath', () => {
        const items = [
            { label: 'Item 0' },
            { label: 'Item 1', children: [
                { label: 'Child 1-0' },
                { label: 'Child 1-1', children: [
                    { label: 'Grandchild 1-1-0' }
                ]}
            ]},
            { label: 'Item 2' }
        ];

        it('should return null for empty/invalid input', () => {
            expect(EditorLogic.getItemAtPath(null, [0])).toBeNull();
            expect(EditorLogic.getItemAtPath([], [0])).toBeNull();
            expect(EditorLogic.getItemAtPath(items, [])).toBeNull();
            expect(EditorLogic.getItemAtPath(items, null)).toBeNull();
        });

        it('should get top-level items', () => {
            expect(EditorLogic.getItemAtPath(items, [0])).toEqual({ label: 'Item 0' });
            expect(EditorLogic.getItemAtPath(items, [2])).toEqual({ label: 'Item 2' });
        });

        it('should get nested items', () => {
            expect(EditorLogic.getItemAtPath(items, [1, 0])).toEqual({ label: 'Child 1-0' });
            expect(EditorLogic.getItemAtPath(items, [1, 1, 0])).toEqual({ label: 'Grandchild 1-1-0' });
        });

        it('should return null for out-of-bounds index', () => {
            expect(EditorLogic.getItemAtPath(items, [5])).toBeNull();
            expect(EditorLogic.getItemAtPath(items, [1, 5])).toBeNull();
            expect(EditorLogic.getItemAtPath(items, [-1])).toBeNull();
        });
    });

    describe('renderMenuItems', () => {
        it('should render simple menu items', () => {
            const items = [
                { label: 'Test Item', type: 'terminal', command: 'echo test' }
            ];
            const html = EditorLogic.renderMenuItems(items, []);

            expect(html).toContain('Test Item');
            expect(html).toContain('data-path="[0]"');
            expect(html).toContain('terminal');
        });

        it('should render nested items with children', () => {
            const items = [
                { label: 'Parent', children: [
                    { label: 'Child' }
                ]}
            ];
            const html = EditorLogic.renderMenuItems(items, []);

            expect(html).toContain('Parent');
            expect(html).toContain('Child');
            expect(html).toContain('class="children"');
            expect(html).toContain('Add Child');
        });

        it('should escape HTML in labels', () => {
            const items = [
                { label: '<script>alert("xss")</script>' }
            ];
            const html = EditorLogic.renderMenuItems(items, []);

            expect(html).not.toContain('<script>');
            expect(html).toContain('&lt;script&gt;');
        });

        it('should show ref badge for ref items', () => {
            const items = [
                { label: 'Ref Item', ref: 'myCommand' }
            ];
            const html = EditorLogic.renderMenuItems(items, []);

            expect(html).toContain('ref: myCommand');
        });
    });

    describe('renderCommands', () => {
        it('should return empty state for no commands', () => {
            expect(EditorLogic.renderCommands(null)).toContain('No commands defined');
            expect(EditorLogic.renderCommands({})).toContain('No commands defined');
        });

        it('should render command list', () => {
            const commands = {
                build: { type: 'terminal', command: 'npm run build' },
                test: { type: 'terminal', command: 'npm test' }
            };
            const html = EditorLogic.renderCommands(commands);

            expect(html).toContain('build');
            expect(html).toContain('npm run build');
            expect(html).toContain('test');
            expect(html).toContain('npm test');
        });

        it('should escape HTML in command names', () => {
            const commands = {
                '<script>': { type: 'terminal', command: 'evil' }
            };
            const html = EditorLogic.renderCommands(commands);

            expect(html).not.toContain('<script>');
            expect(html).toContain('&lt;script&gt;');
        });
    });

    describe('buildItemFromForm', () => {
        it('should build basic item', () => {
            const formData = {
                label: 'Test',
                icon: '',
                type: '',
                command: '',
                terminal: '',
                cwd: '',
                ref: ''
            };
            const item = EditorLogic.buildItemFromForm(formData);

            expect(item).toEqual({ label: 'Test' });
        });

        it('should include icon when provided', () => {
            const formData = {
                label: 'Test',
                icon: '🚀',
                type: '',
                command: '',
                terminal: '',
                cwd: '',
                ref: ''
            };
            const item = EditorLogic.buildItemFromForm(formData);

            expect(item).toEqual({ label: 'Test', icon: '🚀' });
        });

        it('should build terminal item', () => {
            const formData = {
                label: 'Build',
                icon: '',
                type: 'terminal',
                command: 'npm run build',
                terminal: 'Build Terminal',
                cwd: '${workspaceFolder}',
                ref: ''
            };
            const item = EditorLogic.buildItemFromForm(formData);

            expect(item).toEqual({
                label: 'Build',
                type: 'terminal',
                command: 'npm run build',
                terminal: 'Build Terminal',
                cwd: '${workspaceFolder}'
            });
        });

        it('should build ref item', () => {
            const formData = {
                label: 'Ref',
                icon: '',
                type: 'ref',
                command: '',
                terminal: '',
                cwd: '',
                ref: 'myCommand'
            };
            const item = EditorLogic.buildItemFromForm(formData);

            expect(item).toEqual({ label: 'Ref', ref: 'myCommand' });
        });

        it('should build vscodeCommand item', () => {
            const formData = {
                label: 'Open Settings',
                icon: '⚙️',
                type: 'vscodeCommand',
                command: 'workbench.action.openSettings',
                terminal: '',
                cwd: '',
                ref: ''
            };
            const item = EditorLogic.buildItemFromForm(formData);

            expect(item).toEqual({
                label: 'Open Settings',
                icon: '⚙️',
                type: 'vscodeCommand',
                command: 'workbench.action.openSettings'
            });
        });
    });

    describe('determineItemType', () => {
        it('should return "ref" for ref items', () => {
            expect(EditorLogic.determineItemType({ ref: 'cmd' })).toBe('ref');
        });

        it('should return empty string for items with children', () => {
            expect(EditorLogic.determineItemType({ children: [{}] })).toBe('');
        });

        it('should return item type', () => {
            expect(EditorLogic.determineItemType({ type: 'terminal' })).toBe('terminal');
            expect(EditorLogic.determineItemType({ type: 'vscodeCommand' })).toBe('vscodeCommand');
        });

        it('should return empty string for items without type', () => {
            expect(EditorLogic.determineItemType({})).toBe('');
        });
    });

    describe('getFormFieldVisibility', () => {
        it('should show ref field for ref type', () => {
            const visibility = EditorLogic.getFormFieldVisibility('ref');
            expect(visibility.showRefField).toBe(true);
            expect(visibility.showActionFields).toBeFalsy();
        });

        it('should hide all fields for empty type (category)', () => {
            const visibility = EditorLogic.getFormFieldVisibility('');
            expect(visibility.showRefField).toBe(false);
            expect(visibility.showActionFields).toBeFalsy();
        });

        it('should show action fields for terminal type', () => {
            const visibility = EditorLogic.getFormFieldVisibility('terminal');
            expect(visibility.showActionFields).toBe(true);
            expect(visibility.showTerminalFields).toBe(true);
            expect(visibility.showRefField).toBe(false);
        });

        it('should show action fields but not terminal fields for vscodeCommand', () => {
            const visibility = EditorLogic.getFormFieldVisibility('vscodeCommand');
            expect(visibility.showActionFields).toBe(true);
            expect(visibility.showTerminalFields).toBe(false);
        });
    });

    describe('calculateChildPath', () => {
        const items = [
            { label: 'Parent', children: [
                { label: 'Child 0' },
                { label: 'Child 1' }
            ]}
        ];

        it('should return [0] for null parent path with empty items', () => {
            const path = EditorLogic.calculateChildPath(null, []);
            expect(path).toEqual([0]);
        });

        it('should return correct child index for parent with children', () => {
            const path = EditorLogic.calculateChildPath([0], items);
            expect(path).toEqual([0, 2]); // Next child index is 2
        });

        it('should handle empty parent path', () => {
            const path = EditorLogic.calculateChildPath([], items);
            expect(path).toEqual([1]); // Next top-level index
        });
    });

    describe('isSamePath', () => {
        it('should return true for identical paths', () => {
            expect(EditorLogic.isSamePath([0], [0])).toBe(true);
            expect(EditorLogic.isSamePath([1, 2, 3], [1, 2, 3])).toBe(true);
        });

        it('should return false for different paths', () => {
            expect(EditorLogic.isSamePath([0], [1])).toBe(false);
            expect(EditorLogic.isSamePath([1, 2], [1, 3])).toBe(false);
        });

        it('should return false for paths of different lengths', () => {
            expect(EditorLogic.isSamePath([0], [0, 1])).toBe(false);
            expect(EditorLogic.isSamePath([0, 1], [0])).toBe(false);
        });

        it('should return false for null/undefined paths', () => {
            expect(EditorLogic.isSamePath(null, [0])).toBe(false);
            expect(EditorLogic.isSamePath([0], null)).toBe(false);
            expect(EditorLogic.isSamePath(null, null)).toBe(false);
        });
    });
});
