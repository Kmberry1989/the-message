
import fs from 'node:fs';
const must = ['package.json','vercel.json','index.html','src/main.js','src/asset-system.js','src/style.css','public/assets/manifest.json','levels/level-01-mansion.json'];
let ok = true;
for (const f of must) { if (!fs.existsSync(f)) { console.error(`Missing ${f}`); ok=false; } }
const manifest = JSON.parse(fs.readFileSync('public/assets/manifest.json','utf8'));
if (!manifest.draco?.enabled) { console.error('Draco not enabled in manifest'); ok=false; }
if (!Object.keys(manifest.assets||{}).length) { console.error('No assets in manifest'); ok=false; }
const code = fs.readFileSync('src/asset-system.js','utf8');
if (!code.includes('DRACOLoader') || !code.includes('setDRACOLoader')) { console.error('DRACOLoader is not wired'); ok=false; }
console.log(`Manifest assets: ${Object.keys(manifest.assets).length}`);
console.log(ok ? 'Prototype check passed.' : 'Prototype check failed.');
process.exit(ok ? 0 : 1);
