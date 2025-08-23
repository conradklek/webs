import { rm, mkdir, exists } from 'fs/promises';
import tailwind from 'bun-plugin-tailwind';
import { config } from '../src/config.js';
import { join } from 'path';

async function ensureTmpDir() {
  await mkdir(config.TMPDIR, { recursive: true });
}

async function cleanDirectory(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await mkdir(dirPath, { recursive: true });
}

async function generateClientEntry() {
  const glob = new Bun.Glob('**/*.js');
  const componentMapEntries = [];
  if (await exists(config.APP_DIR)) {
    for await (const file of glob.scan(config.APP_DIR)) {
      const componentName = file.replace('.js', '');
      componentMapEntries.push(
        `['${componentName}', () => import('../src/app/${file}')]`,
      );
    }
  }

  const clientEntryCode = `
import { hydrate } from "@conradklek/webs/runtime";

const components = new Map([
  ${componentMapEntries.join(',\n  ')}
]);

hydrate(components);
`;
  await Bun.write(config.TMP_APP_JS, clientEntryCode);
  return clientEntryCode;
}

async function generateServiceWorker() {
  const swCode = `
const CACHE_NAME = 'webs-cache-v1';
const urlsToCache = self.__WEBS_MANIFEST || [];

self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        const urls = urlsToCache.map(entry => entry.url);
        if (!urls.includes('/')) {
            urls.push('/');
        }
        return cache.addAll(urls);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  if (event.request.headers.has('X-Webs-Navigate')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request).then(fetchResponse => {
          if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
            return fetchResponse;
          }
          const responseToCache = fetchResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          return fetchResponse;
        });
      })
  );
});
    `;
  const tmpSwPath = join(config.TMPDIR, 'worker.js');
  await Bun.write(tmpSwPath, swCode);
  return tmpSwPath;
}

async function prepareCss() {
  const glob = new Bun.Glob('**/*.js');
  let themeChunks = [];
  let styleChunks = [];

  if (!(await exists(config.SRC_DIR))) return '';

  const themeRegex = /@theme\s*\{[\s\S]*?\}/g;
  const allStylesRegex = /styles\s*:\s*`([\s\S]*?)`/g;

  for await (const file of glob.scan(config.SRC_DIR)) {
    const filePath = join(config.SRC_DIR, file);
    const src = await Bun.file(filePath).text();
    let match;

    while ((match = allStylesRegex.exec(src)) !== null) {
      let css = match[1];
      if (css) {
        const themes = css.match(themeRegex);
        if (themes) themeChunks.push(...themes);
        const stylesOnly = css.replace(themeRegex, '').trim();
        if (stylesOnly) styleChunks.push(stylesOnly);
      }
    }
  }

  const globalCss = (await exists(config.GLOBAL_CSS_PATH))
    ? await Bun.file(config.GLOBAL_CSS_PATH).text()
    : '';

  const fullCss = `@import "tailwindcss";\n${globalCss}\n${themeChunks.join(
    '\n',
  )}\n${styleChunks.join('\n')}\n`;
  await Bun.write(config.TMP_CSS, fullCss);
}

async function compressAssets(outputs) {
  if (!config.IS_PROD) return {};
  console.log('Compressing assets...');
  const sizes = {};
  await Promise.all(
    outputs.map(async (output) => {
      if (/\.(js|css|html)$/.test(output.path)) {
        const content = await Bun.file(output.path).arrayBuffer();
        const compressed = Bun.gzipSync(Buffer.from(content));
        await Bun.write(`${output.path}.gz`, compressed);
        sizes[output.path] = compressed.byteLength;
      }
    }),
  );
  return sizes;
}

export async function performBuild() {
  console.log('--- Performing client build ---');
  await ensureTmpDir();
  await cleanDirectory(config.OUTDIR);
  await generateClientEntry();
  const swEntryPath = await generateServiceWorker();
  await prepareCss();

  const buildResult = await Bun.build({
    entrypoints: [config.TMP_APP_JS, config.TMP_CSS, swEntryPath],
    outdir: config.OUTDIR,
    target: 'browser',
    splitting: true,
    minify: config.IS_PROD,
    naming: config.IS_PROD ? '[name]-[hash].[ext]' : '[name].[ext]',
    plugins: [tailwind],
    sourcemap: config.IS_PROD ? 'none' : 'inline',
  });

  if (!buildResult.success) {
    console.error('Client build failed:', buildResult.logs);
    return null;
  }

  console.log('Client assets built successfully.');

  const swOutput = buildResult.outputs.find((o) => o.path.includes('worker'));
  if (swOutput) {
    const swPath = swOutput.path;
    const manifestEntries = buildResult.outputs
      .filter((o) => !o.path.includes('worker'))
      .map((o) => ({ url: `/${o.path.split('/').pop()}`, revision: null }));
    let swContent = await Bun.file(swPath).text();
    const manifestString = JSON.stringify(manifestEntries);
    swContent = `self.__WEBS_MANIFEST = ${manifestString};\n` + swContent;
    await Bun.write(swPath, swContent);
    console.log(`Service worker manifest injected into ${swPath}`);
  }
  const manifest = {
    js: buildResult.outputs.find(
      (o) =>
        o.kind === 'entry-point' &&
        o.path.endsWith('.js') &&
        !o.path.includes('worker'),
    )?.path,
    css: buildResult.outputs.find((o) => o.path.endsWith('.css'))?.path,
    sw: swOutput?.path,
  };

  if (config.IS_PROD) {
    manifest.sizes = await compressAssets(buildResult.outputs);
  }

  return manifest;
}
