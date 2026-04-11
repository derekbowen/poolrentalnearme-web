import assert from 'assert';
import fs from 'node:fs/promises';
import path from 'node:path';

const distPath = path.resolve(__dirname, '..', 'dist');
const publicPath = path.join(__dirname, '..', 'public');

const defaultImporterOptions = {
  mode: 'development', // or 'production'
  vite: null,
};

const importer = async ({ mode, vite } = defaultImporterOptions) => {
  const isDevelopmentMode = mode === 'development';
  if (isDevelopmentMode) {
    assert(vite != null, 'vite is required in development mode');
  }

  const { indexHtmlPath, error500HTMLPath, resolveServerEntry, error404HTMLPath } =
    isDevelopmentMode
      ? {
          indexHtmlPath: './index.html',
          error500HTMLPath: path.join(publicPath, '500.html'),
          error404HTMLPath: path.join(publicPath, '404.html'),
          resolveServerEntry: vite.ssrLoadModule('/src/entry-server.jsx'),
        }
      : {
          indexHtmlPath: path.join(distPath, 'client', 'index.html'),
          error500HTMLPath: path.join(distPath, 'server', '500.html'),
          error404HTMLPath: path.join(distPath, 'server', '404.html'),
          resolveServerEntry: import(path.resolve(distPath, 'server', 'entry-server.js')),
        };

  const [indexHtml, serverEntry, error500HTML, error404HTML] = await Promise.all([
    fs.readFile(indexHtmlPath, 'utf-8'),
    resolveServerEntry,
    fs.readFile(error500HTMLPath, 'utf-8'),
    fs.readFile(error404HTMLPath, 'utf-8'),
  ]);

  return {
    indexHtml,
    serverEntry,
    error500HTML,
    error404HTML,
  };
};

export default importer;
