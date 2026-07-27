import helmet from 'helmet';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import passport from 'passport';
import { trustProxy } from './config/server';
import { csp, generateCSPNonce } from './csp';
import { cspEnabled, cspReportUrl, reportOnly } from './config/csp';

const expressConfig = (app) => {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      // referrerPolicy: {
      //   policy: 'origin',
      // },
    })
  );

  if (cspEnabled) {
    app.use(
      bodyParser.json({
        type: ['json', 'application/csp-report'],
      })
    );

    app.use(generateCSPNonce);

    app.use(csp(cspReportUrl, reportOnly));

    const reportValue = (req, key) => {
      const report = req.body ? req.body['csp-report'] : null;
      return report && report[key] ? report[key] : key;
    };

    app.post(cspReportUrl, (req, res) => {
      const effectiveDirective = reportValue(req, 'effective-directive');
      const blockedUri = reportValue(req, 'blocked-uri');
      const msg = `CSP: ${effectiveDirective} doesn't allow ${blockedUri}`;
      res.status(204).send(msg);
    });
  }

  if (trustProxy === 'true') {
    app.enable('trust proxy');
  } else if (trustProxy === 'false') {
    app.disable('trust proxy');
  } else if (trustProxy !== null) {
    app.set('trust proxy', trustProxy);
  }

  app.use(compression());
  app.use(cookieParser());
  app.use(
    express.static('dist/client', {
      index: false,
      etag: false,
      setHeaders: (res, p) => { if (p.includes('/assets/')) { res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); return; }
        // Avoid 304 Not Modified responses for static assets
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.removeHeader('etag');
      },
    })
  );
  app.use(passport.initialize());
};

export default expressConfig;
