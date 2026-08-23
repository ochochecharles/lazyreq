import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const FIXTURE_CONTROLLER = path.resolve(__dirname, '../../../lazyreq-fixture/src/users.controller.ts');

async function waitForText(editor: vscode.TextEditor, needle: string, timeoutMs = 8000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (editor.document.getText().includes(needle)) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	assert.fail(`Timed out waiting for text: ${needle}`);
}

suite('LazyReq Extension Test Suite', () => {
	test('lazyreq.generate inserts generated request body JSON at cursor', async () => {
		const document = await vscode.workspace.openTextDocument(FIXTURE_CONTROLLER);
		const editor = await vscode.window.showTextDocument(document);

		const cursor = new vscode.Position(0, 0);
		editor.selection = new vscode.Selection(cursor, cursor);

		await vscode.commands.executeCommand('lazyreq.generate');

		try {
			await waitForText(editor, '"name": "example"');
		} catch (e) {
			console.log('Document after command:', editor.document.getText().slice(0, 800));
			throw e;
		}
		const text = editor.document.getText();
		assert.ok(text.includes('"email": "user@example.com"'), 'email sample value present');
		assert.ok(text.includes('"age": 1'), 'int sample value present');
		assert.ok(text.includes('"role": "admin"'), 'enum first value present');
		assert.ok(text.includes('"tags": ['), 'array present');
		assert.ok(text.includes('"profile": {'), 'nested DTO present');
		assert.ok(text.includes('"website": "https://example.com"'), 'url sample value present');
	});
});
