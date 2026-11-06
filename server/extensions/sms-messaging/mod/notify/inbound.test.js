// inbound.js forwarding for "Text us" bubble threads: one inbound message goes
// to every routing target, the flood cap counts messages (not recipients),
// and a bubble opener never reaches reply-to-accept. Runs under jest (CI) and
// bun. The Twilio client is mocked one level below twsend.js, so the real
// twsend runs; Supabase is an in-memory fake behind a mocked global fetch.
//
// Every phone number here is a fictional 555 number.
const DEREK = '+15550000001';
const BRANDON = '+15550000002';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.CAMPAIGN_FORWARD_TO = DEREK;
process.env.TWILIO_VALIDATE_SIGNATURE = 'false';

const mockTwilio = { sent: [], failFor: null };
const mockReplyCalls = [];

// The real twilio package does not load under this repo's jest config (the
// package.json `axios` moduleNameMapper fails to resolve inside twilio).
// inbound.js only needs validateRequest, and these tests call the handler
// directly, past the signature check.
jest.mock('twilio', () => ({ validateRequest: () => true }));
jest.mock(
  'extensions/common/mod/sms/instance',
  () => ({
    messages: {
      create: async (opts) => {
        if (mockTwilio.failFor && opts.to === mockTwilio.failFor) throw new Error('twilio 500');
        mockTwilio.sent.push(opts);
        return { sid: `SM${mockTwilio.sent.length}` };
      },
    },
  }),
  { virtual: true }
);
jest.mock('extensions/common/config/sms', () => ({ senderPhoneNumber: '+15550009999' }), {
  virtual: true,
});
jest.mock('./supastore', () => ({
  logInboundReply: async () => {},
  setOptOut: async () => {},
}));
jest.mock('./replyactions', () => ({
  handleReply: async (phone, token) => {
    mockReplyCalls.push({ phone, token });
    return null; // "not a reply-to-accept command": the caller falls through
  },
}));

// Fresh copies, loaded with the env above (see the note in routing.test.js).
if (require.cache) {
  delete require.cache[require.resolve('./routing')];
  delete require.cache[require.resolve('./inbound')];
}
const { handler } = require('./inbound');

// Minimal sms_reply_ctx / sms_log fake (see routing.test.js for the full one).
const useSupabase = ({ brandon }) => {
  const assign = {};
  global.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const u = new URL(url);
    const eq = (k) => (u.searchParams.get(k) || '').replace(/^eq\./, '');
    const ok = (rows) => ({ ok: true, status: 200, json: async () => rows });
    if (method === 'GET' && eq('kind') === 'route_config') {
      return ok([
        { pool: 'brandon_number', tx_id: brandon },
        { pool: 'next_assignee', tx_id: 'derek' },
      ]);
    }
    if (method === 'GET' && eq('kind') === 'route_assign') {
      const tx = assign[eq('phone')];
      return ok(tx ? [{ tx_id: tx }] : []);
    }
    if (method === 'POST' && opts.body) {
      JSON.parse(opts.body).forEach((row) => {
        if (row.kind === 'route_assign') assign[row.phone] = row.tx_id;
      });
    }
    return ok([]);
  };
};

// routing.js caches by Date.now(). bun runs every test file in ONE process,
// so all notify test files share one forward-only clock (see routing.test.js).
const realFetch = global.fetch;
global.notifyTestRealNow = global.notifyTestRealNow || Date.now;
const realNow = global.notifyTestRealNow;
const advanceClock = (ms = 10 * 60 * 1000) => {
  global.notifyTestClock = Math.max(global.notifyTestClock || 0, realNow()) + ms;
  Date.now = () => global.notifyTestClock;
};
let phoneSeq = 0;
const newPhone = () => `+1555020${String(++phoneSeq).padStart(4, '0')}`;

const inbound = async (from, body) => {
  const res = {
    sent: null,
    set() {
      return this;
    },
    status() {
      return this;
    },
    send(x) {
      this.sent = x;
      return this;
    },
  };
  await handler({ body: { From: from, Body: body } }, res);
  return res.sent;
};

const OPENER = "Hi! I'm a host on Pool Rental Near Me. Question about Fees & pricing: ";

beforeEach(() => {
  advanceClock();
  mockTwilio.sent.length = 0;
  mockTwilio.failFor = null;
  mockReplyCalls.length = 0;
});

afterAll(() => {
  Date.now = realNow;
  global.fetch = realFetch;
});

describe('forwarding a "Text us" bubble thread', () => {
  it('sends the same forward to Derek and Brandon', async () => {
    useSupabase({ brandon: BRANDON });
    const from = newPhone();
    const twiml = await inbound(from, `${OPENER}how do add-ons work?`);
    expect(twiml).toContain('<Response></Response>');
    expect(mockTwilio.sent.map((m) => m.to)).toEqual([DEREK, BRANDON]);
    const [toDerek, toBrandon] = mockTwilio.sent;
    expect(toDerek.body).toBe(toBrandon.body);
    expect(toDerek.body).toContain('PRNM reply [BOTH]');
    expect(toDerek.body).toContain(`${from}:`);
    expect(toDerek.body).toContain('how do add-ons work?');
  });

  it("sends to Derek alone while Brandon's number is off", async () => {
    useSupabase({ brandon: 'off' });
    await inbound(newPhone(), OPENER);
    expect(mockTwilio.sent.map((m) => m.to)).toEqual([DEREK]);
    expect(mockTwilio.sent[0].body).toContain('[BOTH]');
  });

  it('counts the flood cap once per inbound message, not once per recipient', async () => {
    useSupabase({ brandon: BRANDON });
    const from = newPhone();
    await inbound(from, OPENER);
    await [2, 3, 4, 5].reduce(
      (prev, i) => prev.then(() => inbound(from, `follow-up ${i}`)),
      Promise.resolve()
    );
    // 5 messages = the cap, each forwarded to both founders.
    expect(mockTwilio.sent).toHaveLength(10);

    mockTwilio.sent.length = 0;
    await inbound(from, 'follow-up 6');
    expect(mockTwilio.sent.map((m) => m.to)).toEqual([DEREK, BRANDON]);
    mockTwilio.sent.forEach((m) => expect(m.body).toContain('…more from'));

    mockTwilio.sent.length = 0;
    await inbound(from, 'follow-up 7');
    expect(mockTwilio.sent).toEqual([]);
  });

  it('one failed send does not stop the other recipient', async () => {
    useSupabase({ brandon: BRANDON });
    const quiet = console.error;
    console.error = () => {};
    try {
      mockTwilio.failFor = DEREK;
      await inbound(newPhone(), OPENER);
    } finally {
      console.error = quiet;
    }
    expect(mockTwilio.sent.map((m) => m.to)).toEqual([BRANDON]);
  });
});

describe('reply-to-accept and bubble openers', () => {
  it('a bubble opener with a lone digit is forwarded, never treated as accept/decline', async () => {
    useSupabase({ brandon: BRANDON });
    const from = newPhone();
    await inbound(from, `${OPENER}can I charge more for 2 guests?`);
    expect(mockReplyCalls).toEqual([]);
    expect(mockTwilio.sent.map((m) => m.to)).toEqual([DEREK, BRANDON]);
  });

  it('an ordinary "1" still goes to reply-to-accept first, as before', async () => {
    useSupabase({ brandon: 'off' });
    const from = newPhone();
    await inbound(from, '1');
    expect(mockReplyCalls).toEqual([{ phone: from, token: '1' }]);
    // handleReply returned null here, so it falls through and is forwarded
    // to the (non-bubble) assignee only.
    expect(mockTwilio.sent.map((m) => m.to)).toEqual([DEREK]);
    expect(mockTwilio.sent[0].body).toContain('PRNM reply [DEREK]');
  });

  it('STOP still opts out without forwarding', async () => {
    useSupabase({ brandon: BRANDON });
    const twiml = await inbound(newPhone(), 'STOP');
    expect(twiml).toContain('You are unsubscribed');
    expect(mockTwilio.sent).toEqual([]);
  });
});
