import express from 'express';
import { createServer } from 'vite';
import basicAuthMiddleware from 'middlewares/basicAuth';
import log from './log';
import importer from './importer';
import { port, base } from './config/server';
import render from './renderer';
import expressConfig from './express-config';
import robotsTxtRoute from './resources/robotsTxt';
import sitemapResourceRoute from './resources/sitemap';
import webmanifestResourceRoute from './resources/webmanifest';
import wellKnownRouter from './wellKnownRouter';
import apiRouter from './apiRouter';

const app = express();
expressConfig(app);

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  base,
});

app.use(vite.middlewares);

const { indexHtml, serverEntry, error500HTML } = await importer({
  mode: 'production',
  vite,
});

app.get('/robots.txt', robotsTxtRoute);
app.get('/sitemap-:resource', sitemapResourceRoute);
app.get('/site.webmanifest', webmanifestResourceRoute);
app.use('/.well-known', wellKnownRouter);
app.use('/api', apiRouter);

// Serve HTML
const assetsRegex = /\/assets\/.*\.(js|css)$/;
app.get('*', basicAuthMiddleware, async (req, res) => {
  try {
    const url = req.originalUrl || req.url;
    if (assetsRegex.test(url)) {
      // Do not render the server entry for assets
      res.sendStatus(404);
      return;
    }

    await render({
      ssrServerEntry: serverEntry,
      htmlMarkup: indexHtml,
      res,
      req,
      error500HTML,
    });
  } catch (e) {
    log.error('Error while rendering:', e);
    res.set('Content-Type', 'text/html');
    res.send(error500HTML);
  }
});

// Start http server
app.listen(port, () => {
  log.info(`Server started at port ${port}`);
});
