import { defineConfig } from '@vscode/test-cli';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
	files: 'out/test/**/*.test.js',
	extensionDevelopmentPath: root,
	mocha: {
		timeout: 60000,
	},
});