import fs from 'node:fs';
import path from 'node:path';

const sourceDir = path.resolve('levels');
const outputDir = path.resolve('public/levels');

function copyDirectory(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });

  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const sourcePath = path.join(fromDir, entry.name);
    const outputPath = path.join(toDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, outputPath);
      continue;
    }

    fs.copyFileSync(sourcePath, outputPath);
  }
}

if (!fs.existsSync(sourceDir)) {
  console.error(`Missing levels source directory: ${sourceDir}`);
  process.exit(1);
}

copyDirectory(sourceDir, outputDir);
console.log(`Synced levels to ${path.relative(process.cwd(), outputDir)}`);
