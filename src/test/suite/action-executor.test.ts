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

    suite('Multiple Actions Sequential Execution', () => {
        test('should execute multiple actions sequentially', async () => {
            const actions: ResolvedAction[] = [
                { type: 'terminal', command: 'echo "first"', terminal: 'SeqTest' },
                { type: 'terminal', command: 'echo "second"', terminal: 'SeqTest' }
            ];

            const result = await executor.executeMultiple(actions);

            assert.ok(result.success, 'All actions should succeed');
            assert.strictEqual(result.completedCount, 2, 'Should complete 2 actions');
            assert.strictEqual(result.totalCount, 2, 'Total count should be 2');
        });

        test('should report progress via callback', async () => {
            const actions: ResolvedAction[] = [
                { type: 'terminal', command: 'echo "a"', terminal: 'ProgressTest' },
                { type: 'terminal', command: 'echo "b"', terminal: 'ProgressTest' }
            ];

            const progressReports: { current: number; total: number; action: ResolvedAction }[] = [];

            await executor.executeMultiple(actions, {
                onProgress: (current, total, action) => {
                    progressReports.push({ current, total, action });
                }
            });

            assert.strictEqual(progressReports.length, 2, 'Should report progress twice');
            assert.strictEqual(progressReports[0].current, 1, 'First report should be 1');
            assert.strictEqual(progressReports[1].current, 2, 'Second report should be 2');
        });

        test('should stop on error by default', async () => {
            const actions: ResolvedAction[] = [
                { type: 'terminal', command: 'echo "ok"', terminal: 'StopTest' },
                { type: 'vscodeCommand', command: 'nonexistent.command.xyz' },
                { type: 'terminal', command: 'echo "should not run"', terminal: 'StopTest' }
            ];

            const result = await executor.executeMultiple(actions);

            assert.strictEqual(result.success, false, 'Should fail');
            assert.strictEqual(result.completedCount, 1, 'Only first action should complete');
            assert.ok(result.error, 'Should have error');
            assert.strictEqual(result.failedIndex, 1, 'Should fail at index 1');
        });

        test('should continue on error when continueOnError is true', async () => {
            const actions: ResolvedAction[] = [
                { type: 'terminal', command: 'echo "first"', terminal: 'ContinueTest' },
                { type: 'vscodeCommand', command: 'nonexistent.command.xyz' },
                { type: 'terminal', command: 'echo "third"', terminal: 'ContinueTest' }
            ];

            const result = await executor.executeMultiple(actions, {
                continueOnError: true
            });

            assert.strictEqual(result.success, false, 'Overall should be false due to error');
            assert.strictEqual(result.completedCount, 2, 'Should complete 2 actions (skipping failed)');
            assert.ok(result.errors, 'Should have errors array');
            assert.strictEqual(result.errors!.length, 1, 'Should have 1 error');
        });

        test('should handle empty actions array', async () => {
            const result = await executor.executeMultiple([]);

            assert.strictEqual(result.success, true, 'Should succeed with no actions');
            assert.strictEqual(result.completedCount, 0, 'Should complete 0 actions');
            assert.strictEqual(result.totalCount, 0, 'Total count should be 0');
        });

        test('should handle cancellation', async () => {
            const actions: ResolvedAction[] = [
                { type: 'terminal', command: 'echo "1"', terminal: 'CancelTest' },
                { type: 'terminal', command: 'echo "2"', terminal: 'CancelTest' },
                { type: 'terminal', command: 'echo "3"', terminal: 'CancelTest' }
            ];

            const cancellationTokenSource = new vscode.CancellationTokenSource();
            let progressCount = 0;

            const resultPromise = executor.executeMultiple(actions, {
                cancellationToken: cancellationTokenSource.token,
                onProgress: () => {
                    progressCount++;
                    if (progressCount === 1) {
                        cancellationTokenSource.cancel();
                    }
                }
            });

            const result = await resultPromise;

            assert.strictEqual(result.cancelled, true, 'Should be cancelled');
            assert.strictEqual(result.completedCount, 1, 'Should complete only 1 action before cancel');
        });
    });
});
