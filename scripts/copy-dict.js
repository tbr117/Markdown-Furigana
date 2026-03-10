/**
 * Copy kuromoji dictionary files from node_modules into the plugin root.
 * Run once after `npm install`: npm run copy-dict
 *
 * The `dict/` folder must be distributed alongside main.js in the
 * plugin release zip for auto-reading to work offline.
 */

const fs = require('fs');
const path = require('path');

const src  = path.join(__dirname, '..', 'node_modules', 'kuromoji', 'dict');
const dest = path.join(__dirname, '..', 'dict');

if (!fs.existsSync(src)) {
  console.error('ERROR: kuromoji not found. Run `npm install` first.');
  process.exit(1);
}

if (!fs.existsSync(dest)) {
  fs.mkdirSync(dest, { recursive: true });
}

const files = fs.readdirSync(src);
files.forEach(file => {
  fs.copyFileSync(path.join(src, file), path.join(dest, file));
});

console.log(`✓ Copied ${files.length} kuromoji dictionary files → dict/`);
