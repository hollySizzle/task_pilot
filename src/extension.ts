import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('TaskPilot extension is now active');

    // Register showMenu command
    const showMenuCommand = vscode.commands.registerCommand('taskPilot.showMenu', async () => {
        vscode.window.showInformationMessage('TaskPilot: Menu command (not implemented yet)');
    });

    context.subscriptions.push(showMenuCommand);
}

export function deactivate() {
    // Cleanup if needed
}
