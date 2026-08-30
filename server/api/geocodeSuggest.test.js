const http = require('http');

// The test that matters most: with the local gazetteer in place, ordinary US
// search must keep working while Nominatim is unavailable. Before c193 an OSM
// outage meant zero suggestions for every city, town, ZIP and state query.

const startStub = handler =>
  new Promise(resolve => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });

const loadHandler = (port, extraEnv = {}) => {
  jest.resetModules();
  process.env.NOMINATIM_URL = `http://127.0.0.1:${port}/search`;
  process.env.NOMINATIM_MIN_INTERVAL_MS = '1';
  Object.assign(process.env, extraEnv);
  return require('./geocodeSuggest');
};

const call = async (handler, q) => {
  let payload = null;
  let code = null;
  const res = {
    status(c) {
      code = c;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
  };
  await handler({ query: { q } }, res);
  return { code, predictions: (payload && payload.predictions) || [] };
};

// Queries that must survive an upstream outage. These are the exact strings
// Mary's search failed on.
const MUST_WORK = ['Windham, NH', 'Windham NH', '03087', 'New Hampshire', 'NH'];

describe('geocodeSuggest with Nominatim unavailable', () => {
  const servers = [];
  afterAll(() =>
    servers.forEach(s => {
      if (typeof s.closeAllConnections === 'function') s.closeAllConnections();
      s.close();
    })
  );
  const track = ({ srv, port }) => {
    servers.push(srv);
    return port;
  };

  const scenarios = [
    ['429 Too Many Requests', (req, res) => { res.writeHead(429); res.end('<html>429</html>'); }, {}],
    ['500 Internal Server Error', (req, res) => { res.writeHead(500); res.end('boom'); }, {}],
    ['timeout / no response', () => {}, { NOMINATIM_TIMEOUT_MS: '150' }],
  ];

  scenarios.forEach(([label, stub, env]) => {
    describe(`upstream returns ${label}`, () => {
      let handler;
      let upstreamCalls = 0;

      beforeAll(async () => {
        upstreamCalls = 0;
        const port = track(
          await startStub((req, res) => {
            upstreamCalls++;
            stub(req, res);
          })
        );
        handler = loadHandler(port, env);
      });

      MUST_WORK.forEach(q => {
        it(`still resolves ${JSON.stringify(q)}`, async () => {
          const { code, predictions } = await call(handler, q);
          expect(code).toEqual(200);
          expect(predictions.length).toBeGreaterThan(0);
          expect(predictions[0].source).toEqual('local');
          expect(predictions[0].bbox).toHaveLength(4);
        });
      });

      it('answers all of them without touching the failing upstream at all', () => {
        expect(upstreamCalls).toEqual(0);
      });
    });
  });
});

describe('geocodeSuggest normal behaviour', () => {
  const servers = [];
  afterAll(() =>
    servers.forEach(s => {
      if (typeof s.closeAllConnections === 'function') s.closeAllConnections();
      s.close();
    })
  );

  it('resolves the local cases with no upstream call', async () => {
    let calls = 0;
    const { srv, port } = await startStub((req, res) => {
      calls++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    });
    servers.push(srv);
    const handler = loadHandler(port);
    for (const q of MUST_WORK.concat(['Austin TX', 'San Antonio, TX', 'CA', '78701'])) {
      const { predictions } = await call(handler, q);
      expect(predictions.length).toBeGreaterThan(0);
    }
    expect(calls).toEqual(0);
  });

  it('still refuses 1-3 character noise that is not a state or ZIP', async () => {
    const { srv, port } = await startStub((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    });
    servers.push(srv);
    const handler = loadHandler(port);
    for (const q of ['a', 'ab', 'zzz', 'QQ']) {
      const { predictions } = await call(handler, q);
      expect(predictions).toEqual([]);
    }
  });

  it('a state abbreviation and its full name produce the same search area', async () => {
    const { srv, port } = await startStub((req, res) => {
      res.writeHead(200);
      res.end('[]');
    });
    servers.push(srv);
    const handler = loadHandler(port);
    const abbr = (await call(handler, 'NH')).predictions[0];
    const full = (await call(handler, 'New Hampshire')).predictions[0];
    expect(abbr.bbox).toEqual(full.bbox);
  });
});
