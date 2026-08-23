import * as vscode from 'vscode';
import { generateBodyJson } from './parser';

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('LazyReq');
	context.subscriptions.push(output);

	const disposable = vscode.commands.registerCommand('lazyreq.generate', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('LazyReq: no active editor.');
			return;
		}
		const document = editor.document;
		if (document.isUntitled) {
			vscode.window.showErrorMessage('LazyReq: save the file first — untitled files have no tsconfig context.');
			return;
		}
		if (document.languageId !== 'typescript' || !document.fileName.endsWith('.ts')) {
			vscode.window.showErrorMessage('LazyReq: open a TypeScript controller file to generate a request body.');
			return;
		}

		output.appendLine(`[LazyReq] Generating for ${document.fileName}`);
		const result = generateBodyJson(document.fileName);
		if (!result.ok) {
			output.appendLine(`[LazyReq] Error: ${result.reason}`);
			vscode.window.showErrorMessage(`LazyReq: ${result.reason}`);
			return;
		}

		const success = await editor.edit((editBuilder) => {
			editBuilder.insert(editor.selection.active, result.json);
		});
		if (!success) {
			output.appendLine('[LazyReq] Edit failed (document may be read-only).');
			vscode.window.showErrorMessage('LazyReq: failed to insert JSON — document may be read-only.');
			return;
		}
		output.appendLine('[LazyReq] Inserted JSON at cursor.');
		vscode.window.showInformationMessage('LazyReq: request body generated.');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}