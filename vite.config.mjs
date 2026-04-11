/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import commonjs from 'vite-plugin-commonjs';
import fs from 'node:fs/promises';
import legacy from '@vitejs/plugin-legacy';
import path from 'node:path';

const projectRootDir = path.resolve(__dirname);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const envFile = loadEnv(mode, process.cwd());
  const env = { ...process.env, ...envFile };

  const isDevelopmentMode = mode === 'development';
  const { VITE_LEGACY_BROWSER_SUPPORT, VITE_GENERATE_SOURCEMAP } = env;
  const isLegacyBrowserSupportEnabled = VITE_LEGACY_BROWSER_SUPPORT === 'true';
  const generateSourceMap = VITE_GENERATE_SOURCEMAP === 'true';

  const aliasConfiguration = [
    { find: 'components', replacement: path.resolve(projectRootDir, 'src/components') },
    { find: 'util', replacement: path.resolve(projectRootDir, 'src/util') },
    { find: 'hooks', replacement: path.resolve(projectRootDir, 'src/hooks') },
    { find: 'ducks', replacement: path.resolve(projectRootDir, 'src/ducks') },
    { find: 'config', replacement: path.resolve(projectRootDir, 'src/config') },
    { find: 'context', replacement: path.resolve(projectRootDir, 'src/context') },
    { find: 'containers', replacement: path.resolve(projectRootDir, 'src/containers') },
  ];

  if (!isDevelopmentMode) {
    aliasConfiguration.push({ find: 'moment', replacement: 'moment/min/moment-with-locales.min' });
  }

  return {
    define: isDevelopmentMode ? { global: {}, process: {} } : { process: {} },
    plugins: [
      commonjs({}),
      react({}),
      isLegacyBrowserSupportEnabled &&
        legacy({
          targets: ['defaults', 'fully supports es6-module', '>0.3%', 'not dead'],
        }),
    ],
    build: {
      sourcemap: generateSourceMap,
    },
    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.jsx?$/,
      exclude: [],
      supported: {
        'top-level-await': true,
      },
    },
    server: {
      port: env.VITE_PORT || 5173,
      fs: {
        strict: true,
      },
    },
    resolve: {
      alias: aliasConfiguration,
    },
    optimizeDeps: {
      // Only scan the real SPA entry. Without this, Vite globs every *.html file
      // in the repo — including public/landing-v*.html and the email templates
      // under ext/transaction-processes/**/*.html — which makes esbuild OOM.
      entries: ['index.html'],
      esbuildOptions: {
        // .js files in this project contain JSX. Set loader at the options level
        // so it applies to BOTH the dep scanner and the bundler (plugins alone
        // aren't enough — the scan pass ignores onLoad-registered loaders).
        loader: { '.js': 'jsx' },
        plugins: [
          {
            name: 'load-js-files-as-jsx',
            setup(build) {
              build.onLoad({ filter: /src\/.*\.js$/ }, async (args) => ({
                loader: 'jsx',
                contents: await fs.readFile(args.path, 'utf8'),
              }));
            },
          },
        ],
      },
    },
  };
});
