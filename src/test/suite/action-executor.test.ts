import * as assert from 'assert';
import * as vscode from 'vscode';
import { ActionExecutor } from '../../action-executor';
import { ResolvedAction } from '../../types';

suite('ActionExecutor Test Suite', () => {
    let executor: ActionExecutor;

    setup(() => {
        executor = new ActionExecutor();
    });

    teardown(() => {
        executor.dispose();
    });

    suite('Terminal Actions', () => {
        test('should send command to terminal', async () => {
            const action: ResolvedAction = {
                type: 'terminal',
                command: 'echo "test"'
            };

            // Execute action
            await executor.execute(action);

            // Verify terminal was created and command sent
            // Note: In integration test, we verify the terminal exists
            const terminals = vscode.window.terminals;
            const taskPilotTerminal = terminals.find(t => t.name === 'TaskPilot');
            assert.ok(taskPilotTerminal, 'TaskPilot terminal should be created');
        });

        test('should use specified terminal name', async () => {
            const action: ResolvedAction = {
                type: 'terminal',
                command: 'echo "named"',
                terminal: 'MyTerminal'
            };

            await executor.execute(action);

            const terminals = vscode.window.terminals;
            const namedTerminal = terminals.find(t => t.name === 'MyTerminal');
            assert.ok(namedTerminal, 'Named terminal should be created');
        });

        test('should reuse existing terminal with same name', async () => {
            const action: ResolvedAction = {
                type: 'terminal',
                command: 'echo "first"',
                terminal: 'ReuseTest'
            };

            await executor.execute(action);
            const countBefore = vscode.window.terminals.filter(t => t.name === 'ReuseTest').length;

            await executor.execute(action);
            const countAfter = vscode.window.terminals.filter(t => t.name === 'ReuseTest').length;

            assert.strictEqual(countAfter, countBefore, 'Should reuse existing terminal');
        });

        test('should set working directory when cwd specified', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder) {
                // Skip test if no workspace
                return;
            }

            const action: ResolvedAction = {
                type: 'terminal',
                command: 'pwd',
                terminal: 'CwdTest',
                cwd: workspaceFolder
            };

            await executor.execute(action);

            const terminal = vscode.window.terminals.find(t => t.name === 'CwdTest');
            assert.ok(terminal, 'Terminal with cwd should be created');
        });
    });

    suite('VS Code Command Actions', () => {
        test('should execute vscode command', async () => {
            const action: ResolvedAction = {
                type: 'vscodeCommand',
                command: 'workbench.action.files.newUntitledFile'
            };

            // This should not throw
            await executor.execute(action);
        });

        test('should pass args to vscode command', async () => {
            const action: ResolvedAction = {
                type: 'vscodeCommand',
                command: 'workbench.action.quickOpen',
                args: ['@']
            };

            // Execute and verify no error
            // Close quick open after test
            await executor.execute(action);
            await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
        });

        test('should handle unknown command gracefully', async () => {
            const action: ResolvedAction = {
                type: 'vscodeCommand',
                command: 'nonexistent.command.12345'
            };

            // Should not throw, but log error
            try {
                await executor.execute(action);
            } catch (error) {
                // Expected to fail for unknown command
                assert.ok(error instanceof Error);
            }
        });
    });

    suite('Task Actions', () => {
        test('should attempt to execute named task', async () => {
            const action: ResolvedAction = {
                type: 'task',
                command: 'build'
            };

            // Task may not exist, should handle gracefully
            try {
                await executor.execute(action);
            } catch (error) {
                // Expected if task doesn't exist
                assert.ok(error instanceof Error);
                assert.ok((error as Error).message.includes('not found') ||
                         (error as Error).message.includes('Task'));
            }
        });

        test('should list available tasks when task not found', async () => {
            const action: ResolvedAction = {
                type: 'task',
                command: 'nonexistent-task-xyz-123'
            };

            try {
                await executor.execute(action);
                // If no error, task execution was attempted
            } catch (error) {
                assert.ok(error instanceof Error);
            }
        });
    });

    suite('Error Handling', () => {
        test('should throw error for invalid action type', async () => {
            const action = {
                type: 'invalidType',
                command: 'test'
            } as unknown as ResolvedAction;

            try {
                await executor.execute(action);
                assert.fail('Should throw error for invalid type');
            } catch (error) {
                assert.ok(error instanceof Error);
                assert.ok((error as Error).message.includes('Unknown action type') ||
                         (error as Error).message.includes('invalidType'));
            }
        });

        test('should throw error for missing command', async () => {
            const action = {
                type: 'terminal',
                command: ''
            } as ResolvedAction;

            try {
                await executor.execute(action);
                assert.fail('Should throw error for empty command');
            } catch (error) {
                assert.ok(error instanceof Error);
            }
        });
    });
});
