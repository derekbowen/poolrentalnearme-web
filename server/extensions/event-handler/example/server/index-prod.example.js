import express from 'express';
import * as sdkUtils from './api-util/sdk';
import loadData from './dataLoader';
import importer from './importer';
import { port, basicAuth } from './config/server';
import render from './renderer';
import expressConfig from './express-config';
import robotsTxtRoute from './resources/robotsTxt';
import sitemapResourceRoute from './resources/sitemap';
import webmanifestResourceRoute from './resources/webmanifest';
import wellKnownRouter from './wellKnownRouter';
import apiRouter from './apiRouter';
import auth from './auth';
import { SHARETRIBE_EVENT } from './extensions/event-handler/common/config/events';
import EventHandler from './extensions/event-handler/mod/broker/instance';
import syncSTData from './extensions/sync-st-db/mod/data-sync/event-handler/index';

const { password, username } = basicAuth;

const hasBasicAuth =
  typeof username === 'string' &&
  username.length > 0 &&
  typeof password === 'string' &&
  password.length > 0;

const app = express();

expressConfig(app);

const { indexHtml, serverEntry, usedStyles, error500HTML } = await importer({
  mode: 'production',
});

app.get('/robots.txt', robotsTxtRoute);
app.get('/sitemap-:resource', sitemapResourceRoute);
app.get('/site.webmanifest', webmanifestResourceRoute);
app.use('/.well-known', wellKnownRouter);

if (hasBasicAuth) {
  app.use(auth.basicAuth(username, password));
}

app.use('/api', apiRouter);

// Serve HTML
app.get('*', async (req, res) => {
  try {
    const context = {};
    const { url } = req;
    const template = indexHtml;
    const sdk = sdkUtils.getSdk(req, res);
    const { preloadedState, translations, hostedConfig } = await loadData(url, sdk, serverEntry);
    const html = render({
      url,
      context,
      data: { preloadedState, translations, hostedConfig },
      ssrServerEntry: serverEntry,
      htmlMarkup: template,
      usedStyles,
    });

    if (context.unauthorized) {
      sdk.authInfo().then((authInfo) => {
        if (authInfo && authInfo.isAnonymous === false) {
          res.status(200).send(html);
        } else {
          res.status(401).send(html);
        }
      });
    } else if (context.forbidden) {
      res.status(403).send(html);
    } else if (context.url) {
      res.redirect(context.url);
    } else if (context.notfound) {
      res.status(404).send(html);
    } else {
      res.send(html);
    }
  } catch (e) {
    console.error('Error while rendering:', e);
    res.set('Content-Type', 'text/html');
    res.send(error500HTML);
  }
});

// Start http server
app.listen(port, async () => {
  console.info(`Server started at http://localhost:${port}`);
  // Initialize event handler
  const broker = new EventHandler();
  app.set('broker', broker);
  broker.handler.add({ eventType: SHARETRIBE_EVENT, handler: syncSTData });
  await broker.init();
});
