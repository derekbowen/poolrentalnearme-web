const http = require('http');

// Spin a stub upstream so the real code path (fetch, timeout, status handling,
// cache, limiter) is exercised against controllable failures. NOMINATIM_URL is
// read at module load, so the module is required fresh per scenario.
const startStub = handler =>
  new Promise(resolve => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });

const loadUpstream = (port, extraEnv = {}) => {
  jest.resetModules();
  process.env.NOMINATIM_URL = `http://127.0.0.1:${port}/search`;
  Object.assign(process.env, extraEnv);
  return require('./geoUpstream');
};

const OK_ROW = [
  {
    place_id: 1,
    lat: '42.8006441',
    lon: '-71.304229',
    display_name: 'Windham, Rockingham County, New Hampshire, United States',
    boundingbox: ['42.760108', '42.850701', '-71.3663038', '-71.236387'],
    address: {},
  },
];

describe('geoUpstream', () => {
  const servers = [];
  afterAll(() => {
    // the timeout stub deliberately never responds; drop its sockets so the
    // test process can exit instead of hanging on an open handle
    servers.forEach(s => {
      if (typeof s.closeAllConnections === 'function') s.closeAllConnections();
      s.close();
    });
  });
  const track = ({ srv, port }) => {
    servers.push(srv);
    return port;
  };

  it('caches a successful lookup and does not call upstream again', async () => {
    let calls = 0;
    const port = track(
      await startStub((req, res) => {
        calls++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(OK_ROW));
      })
    );
    const up = loadUpstream(port, { NOMINATIM_MIN_INTERVAL_MS: '1' });
    const a = await up.nominatimLookup('windham nh');
    const b = await up.nominatimLookup('windham nh');
    expect(a.state).toEqual(up.STATE_SUCCESS);
    expect(a.predictions).toHaveLength(1);
    expect(b.cached).toBe(true);
    expect(calls).toEqual(1);
  });

  it('NEVER caches a 429 — the next call retries upstream', async () => {
    let calls = 0;
    const port = track(
      await startStub((req, res) => {
        calls++;
        res.writeHead(429, { 'Content-Type': 'text/html' });
        res.end('<html>429 Too many requests</html>');
      })
    );
    const up = loadUpstream(port, { NOMINATIM_MIN_INTERVAL_MS: '1' });
    const a = await up.nominatimLookup('windham nh');
    expect(a.state).toEqual(up.STATE_ERROR);
    expect(a.status).toEqual(429);
    expect(up._cache.size).toEqual(0);
    await up.nominatimLookup('windham nh');
    expect(calls).toEqual(2); // retried rather than serving a poisoned empty
  });

  it('NEVER caches a 5xx', async () => {
    const port = track(
      await startStub((req, res) => {
        res.writeHead(500);
        res.end('boom');
      })
    );
    const up = loadUpstream(port, { NOMINATIM_MIN_INTERVAL_MS: '1' });
    const r = await up.nominatimLookup('windham nh');
    expect(r.state).toEqual(up.STATE_ERROR);
    expect(r.status).toEqual(500);
    expect(up._cache.size).toEqual(0);
  });

  it('NEVER caches a timeout', async () => {
    const port = track(
      await startStub(() => {
        /* never responds */
      })
    );
    const up = loadUpstream(port, { NOMINATIM_MIN_INTERVAL_MS: '1', NOMINATIM_TIMEOUT_MS: '150' });
    const r = await up.nominatimLookup('windham nh');
    expect(r.state).toEqual(up.STATE_ERROR);
    expect(r.status).toEqual('timeout');
    expect(up._cache.size).toEqual(0);
  });

  it('NEVER caches an unparseable body', async () => {
    const port = track(
      await startStub((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('<html>not json</html>');
      })
    );
    const up = loadUpstream(port, { NOMINATIM_MIN_INTERVAL_MS: '1' });
    const r = await up.nominatimLookup('windham nh');
    expect(r.state).toEqual(up.STATE_ERROR);
    expect(up._cache.size).toEqual(0);
  });

  it('caches a genuine no-match, distinguishably from an error', async () => {
    let calls = 0;
    const port = track(
      await startStub((req, res) => {
        calls++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('[]');
      })
    );
    const up = loadUpstream(port, { NOMINATIM_MIN_INTERVAL_MS: '1' });
    const a = await up.nominatimLookup('nowhere at all');
    expect(a.state).toEqual(up.STATE_EMPTY);
    expect(a.state).not.toEqual(up.STATE_ERROR);
    const b = await up.nominatimLookup('nowhere at all');
    expect(b.cached).toBe(true);
    expect(calls).toEqual(1);
    // and it is remembered only briefly, not for a day
    const entry = [...up._cache.values()][0];
    expect(entry.state).toEqual(up.STATE_EMPTY);
  });

  it('de-duplicates identical in-flight lookups into ONE upstream call', async () => {
    let calls = 0;
    const port = track(
      await startStub((req, res) => {
        calls++;
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(OK_ROW));
        }, 60);
      })
    );
    const up = loadUpstream(port, { NOMINATIM_MIN_INTERVAL_MS: '1' });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => up.nominatimLookup('windham nh'))
    );
    expect(results.every(r => r.state === up.STATE_SUCCESS)).toBe(true);
    expect(calls).toEqual(1);
    expect(up.stats.deduped).toEqual(19);
  });

  it('throttles distinct lookups to roughly one per interval', async () => {
    const stamps = [];
    const port = track(
      await startStub((req, res) => {
        stamps.push(Date.now());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('[]');
      })
    );
    const up = loadUpstream(port, { NOMINATIM_MIN_INTERVAL_MS: '120' });
    await Promise.all(['aaa', 'bbb', 'ccc', 'ddd'].map(q => up.nominatimLookup(q)));
    expect(stamps).toHaveLength(4);
    for (let i = 1; i < stamps.length; i++) {
      // allow a little scheduler slack, but they must not burst
      expect(stamps[i] - stamps[i - 1]).toBeGreaterThanOrEqual(100);
    }
  });
});
