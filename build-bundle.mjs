import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const order = [
  'src/config.js',
  'src/uiController.js',
  'src/puzzleManager.js',
  'src/pieceController.js',
  'src/animationController.js',
  'src/assetManager.js',
  'src/gameManager.js',
  'src/main.js',
];

const parts = [];

for (const relativeFile of order) {
  const absoluteFile = path.join(__dirname, relativeFile);
  let source = await readFile(absoluteFile, 'utf8');
  source = source
    .replace(/^import\s+.+?;\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  parts.push(`// ${relativeFile}\n${source.trim()}\n`);
}

const bundle = `(() => {\n${parts.join('\n')}\n})();\n`;
await writeFile(path.join(__dirname, 'js/bundle.js'), bundle, 'utf8');
console.log('js/bundle.js rebuilt');
