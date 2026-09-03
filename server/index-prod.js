import express from 'express';
import Axios from 'axios';
import { setupCache } from 'axios-cache-interceptor';
import basicAuthMiddleware from 'middlewares/basicAuth';
import getBroker from 'extensions/common/mod/broker';
import { SHARETRIBE_EVENT } from 'extensions/event-handler/common/config/events';
import createTransactionEventHandler from 'extensions/sms-messaging/mod/event-handlers';
import log from './log';
import importer from './importer';
import { port } from './config/server';
import render from './renderer';
import expressConfig from './express-config';
import robotsTxtRoute from './resources/robotsTxt';
import sitemapResourceRoute from './resources/sitemap';
import webmanifestResourceRoute from './resources/webmanifest';
import wellKnownRouter from './wellKnownRouter';
import apiRouter from './apiRouter';
import checkStartupEnv from './startupEnvCheck';

setupCache(Axios);
log.setup();

// Say out loud, once, on boot, if a production-critical credential is absent.
// Subsystems here disable themselves silently when unconfigured, which is
// indistinguishable from a quiet week. Loud by default; set PRNM_STRICT_ENV=true
// to refuse to start instead. See server/startupEnvCheck.js.
checkStartupEnv(log);

const app = express();
expressConfig(app);

const { indexHtml, serverEntry, error500HTML, error404HTML } = await importer({
  mode: 'production',
});

app.get('/robots.txt', robotsTxtRoute);
app.get('/sitemap-:resource', sitemapResourceRoute);
app.get('/site.webmanifest', webmanifestResourceRoute);
app.use('/.well-known', wellKnownRouter);

app.use('/api', apiRouter);

// c153: tracked host share links — must sit before the '*' renderer catch-all.
import goRedirect from './api/go-redirect';
app.get('/go/:token', goRedirect);

app.use(
  /.*(\.php|\.php7|\/wp-.*\/.*|cgi-bin.*|htdocs\.rar|htdocs\.zip|root\.7z|root\.rar|root\.zip|www\.7z|www\.rar|wwwroot\.7z)$/,
  (req, res) => {
    return res.status(404).send(error404HTML);
  }
);

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
      nonce: res.locals?.cspNonce,
      error500HTML,
    });
  } catch (e) {
    log.error('Error while rendering:', e);
    res.set('Content-Type', 'text/html');
    res.send(error500HTML);
  }
});

log.setupExpressErrorHandler(app);

// Start http server
app.listen(port, async () => {
  log.info(`Server started at port ${port}`);

  const broker = await getBroker();
  app.set('broker', broker);
  // SMS notifications moved OFF the (dead) RabbitMQ broker onto a self-contained
  // Integration API events poller. Broker stays connected but no longer drives SMS.
  // broker.handler.add({ eventType: SHARETRIBE_EVENT, handler: createTransactionEventHandler });
  require('extensions/sms-messaging/mod/notify/poller').startPoller();
});
