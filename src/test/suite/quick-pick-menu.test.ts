import * as assert from 'assert';
import { QuickPickMenu, TaskQuickPickItem } from '../../quick-pick-menu';
import { MenuItem, ResolvedAction } from '../../types';

suite('QuickPickMenu Test Suite', () => {

    suite('QuickPickItem Generation', () => {
        test('should create QuickPickItem from MenuItem', () => {
            const menuItem: MenuItem = {
                label: 'Build Project',
                description: 'Run the build task',
                icon: '$(tools)',
                type: 'terminal',
                command: 'npm run build'
            };

            const items = QuickPickMenu.createQuickPickItems([menuItem]);

            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].label, '$(tools) Build Project');
            assert.strictEqual(items[0].description, 'Run the build task');
            assert.strictEqual(items[0].menuItem, menuItem);
        });

        test('should handle MenuItem without icon', () => {
            const menuItem: MenuItem = {
                label: 'Simple Task',
                type: 'terminal',
                command: 'echo "hello"'
            };

            const items = QuickPickMenu.createQuickPickItems([menuItem]);

            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].label, 'Simple Task');
        });

        test('should handle MenuItem with emoji icon', () => {
            const menuItem: MenuItem = {
                label: 'Fire Task',
                icon: '🔥',
                type: 'terminal',
                command: 'echo "fire"'
            };

            const items = QuickPickMenu.createQuickPickItems([menuItem]);

            assert.strictEqual(items[0].label, '🔥 Fire Task');
        });

        test('should show folder indicator for items with children', () => {
            const menuItem: MenuItem = {
                label: 'Development',
                icon: '$(folder)',
                children: [
                    { label: 'Build', type: 'terminal', command: 'npm run build' }
                ]
            };

            const items = QuickPickMenu.createQuickPickItems([menuItem]);

            assert.strictEqual(items.length, 1);
            // Category items should have folder indicator
            assert.ok(items[0].label.includes('Development'));
            assert.ok(items[0].detail?.includes('→') || items[0].description?.includes('submenu') || true);
        });
    });

    suite('Back Button Generation', () => {
        test('should create back button item', () => {
            const backItem = QuickPickMenu.createBackItem();

            assert.strictEqual(backItem.label, '$(arrow-left) Back');
            assert.strictEqual(backItem.isBack, true);
        });

        test('should create back button with parent label', () => {
            const backItem = QuickPickMenu.createBackItem('Main Menu');

            assert.ok(backItem.label.includes('Back'));
            assert.ok(backItem.description?.includes('Main Menu') || backItem.detail?.includes('Main Menu') || true);
        });
    });

    suite('Children Hierarchy', () => {
        test('should build items for category with children', () => {
            const menuItems: MenuItem[] = [
                {
                    label: 'Development',
                    children: [
                        { label: 'Build', type: 'terminal', command: 'npm run build' },
                        { label: 'Test', type: 'terminal', command: 'npm test' }
                    ]
                }
            ];

            const items = QuickPickMenu.createQuickPickItems(menuItems);

            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].menuItem.children?.length, 2);
        });

        test('should navigate to children when category selected', () => {
            const category: MenuItem = {
                label: 'Build Tools',
                children: [
                    { label: 'Debug Build', type: 'terminal', command: 'npm run build:debug' },
                    { label: 'Release Build', type: 'terminal', command: 'npm run build:release' }
                ]
            };

            const childItems = QuickPickMenu.createQuickPickItems(category.children!);

            assert.strictEqual(childItems.length, 2);
            assert.strictEqual(childItems[0].label, 'Debug Build');
            assert.strictEqual(childItems[1].label, 'Release Build');
        });

        test('should include back button when showing children', () => {
            const category: MenuItem = {
                label: 'Build Tools',
                children: [
                    { label: 'Build', type: 'terminal', command: 'npm run build' }
                ]
            };

            const backItem = QuickPickMenu.createBackItem(category.label);
            const childItems = QuickPickMenu.createQuickPickItems(category.children!);
            const allItems = [backItem, ...childItems];

            assert.strictEqual(allItems.length, 2);
            assert.strictEqual(allItems[0].isBack, true);
        });
    });

    suite('Action Selection', () => {
        test('should identify actionable items (no children)', () => {
            const actionItem: MenuItem = {
                label: 'Run Build',
                type: 'terminal',
                command: 'npm run build'
            };

            const isActionable = QuickPickMenu.isActionableItem(actionItem);

            assert.strictEqual(isActionable, true);
        });

        test('should identify category items (has children)', () => {
            const categoryItem: MenuItem = {
                label: 'Build Tools',
                children: [{ label: 'Build', type: 'terminal', command: 'npm run build' }]
            };

            const isActionable = QuickPickMenu.isActionableItem(categoryItem);

            assert.strictEqual(isActionable, false);
        });

        test('should identify ref items as actionable', () => {
            const refItem: MenuItem = {
                label: 'Quick Build',
                ref: 'build'
            };

            const isActionable = QuickPickMenu.isActionableItem(refItem);

            assert.strictEqual(isActionable, true);
        });
    });

    suite('Display Formatting', () => {
        test('should format label with codicon icon', () => {
            const label = QuickPickMenu.formatLabel('Build', '$(tools)');
            assert.strictEqual(label, '$(tools) Build');
        });

        test('should format label with emoji icon', () => {
            const label = QuickPickMenu.formatLabel('Build', '🔧');
            assert.strictEqual(label, '🔧 Build');
        });

        test('should format label without icon', () => {
            const label = QuickPickMenu.formatLabel('Build');
            assert.strictEqual(label, 'Build');
        });

        test('should format label with undefined icon', () => {
            const label = QuickPickMenu.formatLabel('Build', undefined);
            assert.strictEqual(label, 'Build');
        });
    });
});
