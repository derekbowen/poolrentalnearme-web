// routing.js: the "Text us" bubble opener and the 'both' assignment, plus the
// existing round-robin behaviour it must not disturb. Runs under jest (CI:
// `npx jest server`) and bun. Supabase is an in-memory fake behind a mocked
// global fetch; no network, no real numbers.
//
// Every phone number here is a fictional 555 number. DEREK and BRANDON are
// stand-ins injected through the same env/config the module reads in prod.
const DEREK = '+15550000001';
const BRANDON = '+15550000002';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.CAMPAIGN_FORWARD_TO = DEREK;

// routing.js reads its env when it loads. bun runs every test file in one
// process with one module cache, and another file (the client contract test)
// may already have loaded it without this env: always load a fresh copy.
const fresh = (id) => {
  if (require.cache) delete require.cache[require.resolve(id)];
  return require(id); // eslint-disable-line import/no-dynamic-require, global-require
};
const routing = fresh('./routing');

const { isBubbleOpener, resolveTarget, getAssignment } = routing;

// ---- fake Supabase ---------------------------------------------------------
// Serves exactly the sms_reply_ctx / sms_log calls routing.js makes, and
// records every call so tests can assert what was (not) written.
const fakeSupabase = ({ brandon = 'off', next = 'derek', assignments = {} } = {}) => {
  const db = {
    config: { brandon_number: brandon, next_assignee: next },
    assign: { ...assignments },
    rows: [],
    calls: [],
  };
  const reply = (rows, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => rows,
  });
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    const q = u.searchParams;
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    db.calls.push({ method, table, search: u.search, body });
    if (table === 'sms_log') return reply([]);
    if (table !== 'sms_reply_ctx') return reply({}, 404);
    const eq = (key) => (q.get(key) || '').replace(/^eq\./, '');
    if (method === 'GET' && eq('kind') === 'route_config') {
      return reply(Object.entries(db.config).map(([pool, value]) => ({ pool, tx_id: value })));
    }
    if (method === 'GET' && eq('kind') === 'route_assign') {
      const phone = eq('phone');
      return reply(db.assign[phone] ? [{ tx_id: db.assign[phone] }] : []);
    }
    if (method === 'POST') {
      body.forEach((row) => {
        db.rows.push(row);
        if (row.kind === 'route_assign') db.assign[row.phone] = row.tx_id;
      });
      return reply([]);
    }
    if (method === 'PATCH' && eq('pool') === 'next_assignee') {
      if (db.config.next_assignee === eq('tx_id')) db.config.next_assignee = body.tx_id;
      return reply([]);
    }
    return reply({}, 400);
  };
  return { db, fetchImpl };
};

// routing.js caches config (30s) and assignments (60s) in-process. Each test
// moves the clock forward so no cached state survives into the next one, and
// uses its own phone number. bun runs every test file in ONE process (shared
// module cache, shared hooks), so all notify test files share one clock on
// `global` that only ever moves forward.
const realFetch = global.fetch;
global.notifyTestRealNow = global.notifyTestRealNow || Date.now;
const realNow = global.notifyTestRealNow;
const advanceClock = (ms = 10 * 60 * 1000) => {
  global.notifyTestClock = Math.max(global.notifyTestClock || 0, realNow()) + ms;
  Date.now = () => global.notifyTestClock;
};
let phoneSeq = 0;
const newPhone = () => `+1555010${String(++phoneSeq).padStart(4, '0')}`;

const SWIMMER_OPENER =
  "Hi! I'm a swimmer on Pool Rental Near Me. Question about Safety, injury, damage or a refund dispute: ";
const HOST_OPENER = "Hi! I'm a host on Pool Rental Near Me. Question about Fees & pricing: ";
const OTHER_OPENER = 'Hi! I have a question about Pool Rental Near Me: ';

beforeEach(() => advanceClock());

afterAll(() => {
  Date.now = realNow;
  global.fetch = realFetch;
});

const use = (opts) => {
  const fake = fakeSupabase(opts);
  global.fetch = fake.fetchImpl;
  return fake.db;
};

// ---- isBubbleOpener ---------------------------------------------------------
describe('isBubbleOpener', () => {
  it('recognises all three prefills exactly as the site builds them', () => {
    expect(isBubbleOpener(SWIMMER_OPENER)).toBe(true);
    expect(isBubbleOpener(HOST_OPENER)).toBe(true);
    expect(isBubbleOpener(OTHER_OPENER)).toBe(true);
  });

  it('still recognises them with a question typed after the prefill', () => {
    expect(isBubbleOpener(`${HOST_OPENER}can I change my price for weekends?`)).toBe(true);
    expect(isBubbleOpener(`${OTHER_OPENER}do you have a press contact?`)).toBe(true);
  });

  it('still recognises them after Twilio trims the trailing space', () => {
    expect(isBubbleOpener(SWIMMER_OPENER.trim())).toBe(true);
    expect(isBubbleOpener(HOST_OPENER.trim())).toBe(true);
    expect(isBubbleOpener(OTHER_OPENER.trim())).toBe(true);
  });

  it('accepts a curly apostrophe', () => {
    expect(isBubbleOpener(SWIMMER_OPENER.replace("'", '\u2019'))).toBe(true);
    expect(isBubbleOpener(HOST_OPENER.replace("'", '\u2019'))).toBe(true);
  });

  it('is case-insensitive and ignores leading whitespace', () => {
    expect(isBubbleOpener(HOST_OPENER.toUpperCase())).toBe(true);
    expect(isBubbleOpener(OTHER_OPENER.toLowerCase())).toBe(true);
    expect(isBubbleOpener(`  \n\t${SWIMMER_OPENER}`)).toBe(true);
  });

  it('does not match ordinary host replies and commands', () => {
    const replies = ['1', '2', 'YES', 'yes', 'STOP', 'HELP', 'Hi Derek', 'Hi Derek!', 'Thanks!'];
    replies.forEach((text) => expect(isBubbleOpener(text)).toBe(false));
  });

  it('does not match the landing-page "Text Derek" prefill', () => {
    expect(
      isBubbleOpener('Hi Derek! I\u2019m looking at Pool Rental Near Me and I have a question.')
    ).toBe(false);
  });

  it('does not match partial, reworded or mid-message openers', () => {
    expect(isBubbleOpener("Hi! I'm a swimmer")).toBe(false);
    expect(isBubbleOpener("Hi! I'm a host on Pool Rental Near Me.")).toBe(false);
    expect(isBubbleOpener("Hi I'm a host on Pool Rental Near Me. Question about fees")).toBe(false);
    expect(isBubbleOpener("Hi! I'm a guest on Pool Rental Near Me. Question about x")).toBe(false);
    expect(isBubbleOpener(`Sorry, ${HOST_OPENER}`)).toBe(false);
  });

  it('is false for empty and non-string input', () => {
    ['', '   ', null, undefined, 42, {}, []].forEach((v) => expect(isBubbleOpener(v)).toBe(false));
  });
});

// ---- resolveTarget: bubble threads ------------------------------------------
describe('resolveTarget for a new conversation that starts with a bubble opener', () => {
  it("assigns 'both' and forwards to Derek alone while Brandon's number is off", async () => {
    const db = use({ brandon: 'off' });
    const phone = newPhone();
    const t = await resolveTarget(phone, OTHER_OPENER);
    expect(t).toEqual({ assignee: 'both', to: DEREK, targets: [DEREK], label: 'BOTH' });
    expect(db.assign[phone]).toBe('both');
    const saved = db.rows.find((r) => r.kind === 'route_assign' && r.phone === phone);
    expect(saved).toMatchObject({ tx_id: 'both', when_label: 'auto-bubble' });
  });

  it('forwards to Derek and Brandon while Brandon is configured', async () => {
    use({ brandon: BRANDON });
    const t = await resolveTarget(newPhone(), HOST_OPENER);
    expect(t).toEqual({ assignee: 'both', to: DEREK, targets: [DEREK, BRANDON], label: 'BOTH' });
  });

  it.each(['derek', 'brandon'])(
    'does not consume or advance the round-robin pointer (next: %s)',
    async (next) => {
      const db = use({ brandon: BRANDON, next });
      await resolveTarget(newPhone(), SWIMMER_OPENER);
      expect(db.config.next_assignee).toBe(next);
      expect(db.calls.filter((c) => c.method === 'PATCH')).toEqual([]);
    }
  );

  it("reads 'both' back for the thread's later messages", async () => {
    const db = use({ brandon: BRANDON });
    const phone = newPhone();
    await resolveTarget(phone, OTHER_OPENER);
    const again = await resolveTarget(phone, 'Thanks, also: what time?');
    expect(again.assignee).toBe('both');
    expect(again.targets).toEqual([DEREK, BRANDON]);
    // Only the first message wrote an assignment.
    expect(db.rows.filter((r) => r.kind === 'route_assign' && r.phone === phone)).toHaveLength(1);
  });

  it("getAssignment reads a stored 'both' from sms_reply_ctx after the cache expires", async () => {
    const phone = newPhone();
    use({ assignments: { [phone]: 'both' } });
    expect(await getAssignment(phone)).toBe('both');
  });

  it("a stored Brandon number equal to Derek's is not messaged twice", async () => {
    use({ brandon: DEREK });
    const t = await resolveTarget(newPhone(), HOST_OPENER);
    expect(t.targets).toEqual([DEREK]);
  });
});

// ---- resolveTarget: existing behaviour preserved ----------------------------
describe('resolveTarget keeps the existing routing', () => {
  it('an existing assignment wins over a bubble opener', async () => {
    const toBrandon = newPhone();
    const toDerek = newPhone();
    const db = use({
      brandon: BRANDON,
      assignments: { [toBrandon]: 'brandon', [toDerek]: 'derek' },
    });
    expect(await resolveTarget(toBrandon, HOST_OPENER)).toEqual({
      assignee: 'brandon',
      to: BRANDON,
      label: 'BRANDON',
    });
    expect(await resolveTarget(toDerek, OTHER_OPENER)).toEqual({
      assignee: 'derek',
      to: DEREK,
      label: 'DEREK',
    });
    expect(db.rows).toEqual([]); // nothing re-assigned
  });

  it('a non-bubble new conversation pins to Derek while Brandon is off', async () => {
    const db = use({ brandon: 'off', next: 'brandon' });
    const phone = newPhone();
    expect(await resolveTarget(phone, 'Hi Derek')).toEqual({
      assignee: 'derek',
      to: DEREK,
      label: 'DEREK',
    });
    expect(db.rows.find((r) => r.phone === phone)).toMatchObject({
      tx_id: 'derek',
      when_label: 'auto-solo',
    });
    expect(db.config.next_assignee).toBe('brandon');
  });

  it('a non-bubble new conversation takes the round-robin turn and advances it', async () => {
    const db = use({ brandon: BRANDON, next: 'brandon' });
    const first = newPhone();
    expect(await resolveTarget(first, '1')).toEqual({
      assignee: 'brandon',
      to: BRANDON,
      label: 'BRANDON',
    });
    expect(db.rows.find((r) => r.phone === first)).toMatchObject({ when_label: 'auto-rr' });
    expect(db.config.next_assignee).toBe('derek');

    advanceClock(); // let the config cache expire, as in production
    expect((await resolveTarget(newPhone(), 'YES')).assignee).toBe('derek');
    expect(db.config.next_assignee).toBe('brandon');
  });

  it('a call without message text behaves exactly as before', async () => {
    use({ brandon: 'off' });
    expect((await resolveTarget(newPhone())).assignee).toBe('derek');
  });

  it('a Brandon thread whose number was switched off still reaches Derek', async () => {
    const phone = newPhone();
    use({ brandon: 'off', assignments: { [phone]: 'brandon' } });
    expect(await resolveTarget(phone, 'hello')).toEqual({
      assignee: 'derek',
      to: DEREK,
      label: 'DEREK',
    });
  });
});

// ---- fail-safe ----------------------------------------------------------------
describe('resolveTarget fails safe to Derek', () => {
  const DEREK_ONLY = { assignee: 'derek', to: DEREK, label: 'DEREK' };
  let restoreConsole;
  const quietErrors = () => {
    const original = console.error;
    console.error = () => {};
    restoreConsole = () => {
      console.error = original;
    };
  };
  afterEach(() => {
    if (restoreConsole) restoreConsole();
    restoreConsole = null;
  });

  it('when the network is down, for a bubble opener and for an ordinary reply', async () => {
    quietErrors();
    global.fetch = async () => {
      throw new Error('network down');
    };
    expect(await resolveTarget(newPhone(), HOST_OPENER)).toEqual(DEREK_ONLY);
    expect(await resolveTarget(newPhone(), 'hello')).toEqual(DEREK_ONLY);
  });

  it('when Supabase answers with an error status', async () => {
    quietErrors();
    global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    expect(await resolveTarget(newPhone(), OTHER_OPENER)).toEqual(DEREK_ONLY);
  });

  it("when saving the 'both' assignment fails", async () => {
    quietErrors();
    const fake = fakeSupabase({ brandon: BRANDON });
    global.fetch = async (url, opts = {}) =>
      (opts.method || 'GET') === 'POST' && url.includes('sms_reply_ctx')
        ? { ok: false, status: 503, json: async () => ({}) }
        : fake.fetchImpl(url, opts);
    expect(await resolveTarget(newPhone(), SWIMMER_OPENER)).toEqual(DEREK_ONLY);
  });

  it('when there is no sender number', async () => {
    expect(await resolveTarget('', HOST_OPENER)).toEqual(DEREK_ONLY);
  });
});
