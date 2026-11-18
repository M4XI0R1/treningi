import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Generates dist/sw.js after the build: precaches every file of the build
 * (hashed assets + public files) under a cache name derived from the
 * content hash, so every deploy gets a new, versioned cache.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'trening-sw',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(full);
        }
      };
      walk(outDir);
      const hash = createHash('sha256');
      const assets: string[] = [];
      for (const file of files.sort()) {
        const rel = relative(outDir, file).split('\\').join('/');
        if (rel === 'sw.js' || rel === '.nojekyll') continue;
        hash.update(rel).update(readFileSync(file));
        assets.push(rel === 'index.html' ? './' : `./${rel}`);
      }
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(resolve(root, 'src/sw-template.js'), 'utf8');
      const sw = template
        .replace('__VERSION__', version)
        .replace('__ASSETS__', JSON.stringify(assets, null, 2));
      writeFileSync(join(outDir, 'sw.js'), sw);
      writeFileSync(join(outDir, '.nojekyll'), '');
      console.log(`[trening-sw] sw.js v${version}, ${assets.length} plików w cache`);
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  plugins: [serviceWorker()],
});
