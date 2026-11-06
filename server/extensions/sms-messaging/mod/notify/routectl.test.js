// routectl.js, the operator CLI for reply routing: 'both' (the assignment the
// site's "Text us" bubble creates) can be assigned by hand and is counted in
// the `status` totals. Runs under jest (CI). Supabase is mocked one level
// down, at routing.js's rest()/logRoute(); nothing touches the network.
//
// Every phone number here is a fictional 555 number.
const mockCalls = { rest: [], logRoute: [] };
let mockRows = { config: [], assign: [] };

jest.mock('./routing', () => ({
  rest: async (path, opts = {}) => {
    mockCalls.rest.push({ path, ...opts });
    let rows = [];
    if (path.includes('kind=eq.route_config')) rows = mockRows.config;
    if (path.includes('kind=eq.route_assign') && (!opts.method || opts.method === 'GET')) {
      rows = mockRows.assign;
    }
    return { ok: true, json: async () => rows };
  },
  logRoute: async (...args) => {
    mockCalls.logRoute.push(args);
  },
}));

const routectl = require('./routectl');

const PHONE = '+15550001234';

beforeEach(() => {
  mockCalls.rest = [];
  mockCalls.logRoute = [];
  mockRows = { config: [], assign: [] };
});

describe('assignees', () => {
  it("are derek, brandon and both", () => {
    expect(routectl.ASSIGNEES).toEqual(['derek', 'brandon', 'both']);
  });

  it("accept 'assign <phone> both' and still reject anything else", () => {
    ['derek', 'brandon', 'both'].forEach((who) => expect(routectl.assignError(PHONE, who)).toBeNull());
    expect(routectl.assignError(PHONE, 'BOTH')).toMatch(/bad assignee: BOTH \(want derek\|brandon\|both\)/);
    expect(routectl.assignError(PHONE, 'bob')).toMatch(/bad assignee/);
    expect(routectl.assignError(PHONE, undefined)).toMatch(/bad assignee/);
    expect(routectl.assignError('5550001234', 'both')).toMatch(/bad phone/);
    expect(routectl.assignError(undefined, 'both')).toMatch(/bad phone/);
  });
});

describe("assign <phone> both", () => {
  it("replaces the phone's assignment with a manual 'both' row and logs it", async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await routectl.assign(PHONE, 'both');
    } finally {
      log.mockRestore();
    }
    const [del, post] = mockCalls.rest;
    expect(del.method).toBe('DELETE');
    expect(del.path).toBe(`sms_reply_ctx?kind=eq.route_assign&phone=eq.${encodeURIComponent(PHONE)}`);
    expect(post.method).toBe('POST');
    expect(post.path).toBe('sms_reply_ctx');
    expect(post.body).toEqual([
      expect.objectContaining({ phone: PHONE, tx_id: 'both', kind: 'route_assign', when_label: 'manual' }),
    ]);
    expect(mockCalls.logRoute).toEqual([[PHONE, 'reassigned', 'route|both|manual']]);
  });
});

describe('status', () => {
  it('lists BOTH rows and counts them in the totals', async () => {
    mockRows.config = [{ pool: 'brandon_number', tx_id: '+15550000002' }];
    mockRows.assign = [
      { phone: '+15550000011', tx_id: 'derek', when_label: 'auto', created_at: '2026-11-01T10:00:00Z' },
      { phone: '+15550000012', tx_id: 'brandon', when_label: 'auto', created_at: '2026-11-02T10:00:00Z' },
      { phone: '+15550000013', tx_id: 'both', when_label: 'auto-bubble', created_at: '2026-11-03T10:00:00Z' },
      { phone: '+15550000014', tx_id: 'both', when_label: 'manual', created_at: '2026-11-04T10:00:00Z' },
    ];
    const lines = [];
    const log = jest.spyOn(console, 'log').mockImplementation((...a) => lines.push(a.join(' ')));
    try {
      await routectl.status();
    } finally {
      log.mockRestore();
    }
    expect(lines).toContain('assignments (4):');
    expect(lines.filter((l) => l.includes('-> BOTH'))).toHaveLength(2);
    expect(lines[lines.length - 1]).toBe('totals: DEREK 1 · BRANDON 1 · BOTH 2');
  });

  it('shows every assignee in the totals, even at zero', () => {
    expect(routectl.totalsLine({})).toBe('totals: DEREK 0 · BRANDON 0 · BOTH 0');
  });
});
