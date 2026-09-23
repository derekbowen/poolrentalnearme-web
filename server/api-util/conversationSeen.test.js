const { isUnread, seenPatch, makeHandlers, seenKey } = require('./conversationSeen');

const HOST = 'host-1';
const GUEST = 'guest-1';
const T = h => new Date(Date.UTC(2026, 8, 25, h)).toISOString(); // well after the baseline

// ---------------------------------------------------------------------------
// A fake Sharetribe backend: one persisted store shared by every "device".
// Each device is a separate SDK instance, like two browsers with their own
// session cookie for the same user. updateProfile merges top-level
// privateData keys, exactly as Sharetribe does.
// ---------------------------------------------------------------------------
function backend() {
  const be = {};
  const users = { [HOST]: { privateData: {} }, [GUEST]: { privateData: {} } };
  const txs = []; // { id, providerId, customerId, messages: [{ id, senderId, createdAt }] }
  const writes = [];
  const sdkFor = userId => ({
    currentUser: {
      show: async () => ({
        data: {
          data: {
            id: { uuid: userId },
            attributes: { profile: { privateData: { ...users[userId].privateData } } },
          },
        },
      }),
      updateProfile: async ({ privateData }) => {
        writes.push({ userId, privateData });
        Object.assign(users[userId].privateData, privateData); // top-level merge
        return {};
      },
    },
    transactions: {
      query: async ({ include = [] } = {}) => {
        if (be.rejectMessagesInclude && include.includes('messages')) {
          throw Object.assign(new Error('bad include'), { status: 400, statusText: 'Bad Request', data: {} });
        }
        const mine = txs.filter(t => t.providerId === userId || t.customerId === userId);
        const included = [];
        const data = mine.map(t => {
          t.messages.forEach(m =>
            included.push({
              id: { uuid: m.id },
              type: 'message',
              attributes: { createdAt: new Date(m.createdAt) },
              relationships: { sender: { data: { id: { uuid: m.senderId }, type: 'user' } } },
            })
          );
          return {
            id: { uuid: t.id },
            type: 'transaction',
            relationships: {
              provider: { data: { id: { uuid: t.providerId }, type: 'user' } },
              customer: { data: { id: { uuid: t.customerId }, type: 'user' } },
              listing: { data: { id: { uuid: 'L1' }, type: 'listing' } },
              messages: { data: t.messages.map(m => ({ id: { uuid: m.id }, type: 'message' })) },
            },
          };
        });
        included.push(
          { id: { uuid: GUEST }, type: 'user', attributes: { profile: { displayName: 'Sneakers G' } } },
          { id: { uuid: HOST }, type: 'user', attributes: { profile: { displayName: 'Jaclyn B' } } },
          { id: { uuid: 'L1' }, type: 'listing', attributes: { title: 'Backyard Oasis CT' } }
        );
        return { data: { data, included } };
      },
    },
    messages: {
      query: async ({ transactionId }) => {
        const t = txs.find(x => x.id === ((transactionId && transactionId.uuid) || transactionId));
        if (!t || (t.providerId !== userId && t.customerId !== userId)) {
          throw Object.assign(new Error('forbidden'), { status: 403, statusText: 'Forbidden', data: {} });
        }
        const newestFirst = [...t.messages].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        return {
          data: {
            data: newestFirst.map(m => ({
              attributes: { createdAt: new Date(m.createdAt) },
              relationships: { sender: { data: { id: { uuid: m.senderId }, type: 'user' } } },
            })),
          },
        };
      },
    },
  });
  let n = 0;
  const say = (txId, senderId, createdAt) =>
    txs.find(t => t.id === txId).messages.push({ id: `m${++n}`, senderId, createdAt });
  const open = (id, providerId = HOST, customerId = GUEST) =>
    txs.push({ id, providerId, customerId, messages: [] });
  return Object.assign(be, { sdkFor, say, open, users, writes });
}

const res = () => {
  const r = { code: null, body: null, headers: {} };
  r.status = c => ((r.code = c), r);
  r.json = b => ((r.body = b), r);
  r.set = (k, v) => ((r.headers[k] = v), r);
  r.end = () => r;
  return r;
};

// A device = a handler pair bound to one SDK instance for one user.
const device = (be, userId) => {
  const sdk = be.sdkFor(userId);
  const h = makeHandlers({
    getSdk: () => sdk,
    handleError: (r, e) => r.status(e.status || 500).json({ error: e.message }),
    toUUID: id => id,
  });
  return {
    unread: async () => {
      const r = res();
      await h.unread({}, r);
      if (r.code !== 200) throw new Error(`unread ${r.code}`);
      return r.body.unread;
    },
    view: async (transactionId, through) => {
      const r = res();
      await h.seen({ body: { transactionId, through } }, r);
      return r;
    },
  };
};

describe('isUnread()', () => {
  it('inbound message never seen -> unread', () => {
    expect(isUnread({ meId: HOST, messages: [{ senderId: GUEST, createdAt: T(10) }], seenIso: null })).toBe(true);
  });
  it('seen through the latest message -> read', () => {
    expect(isUnread({ meId: HOST, messages: [{ senderId: GUEST, createdAt: T(10) }], seenIso: T(10) })).toBe(false);
  });
  it('my own message never makes a conversation unread for me', () => {
    expect(isUnread({ meId: HOST, messages: [{ senderId: HOST, createdAt: T(10) }], seenIso: null })).toBe(false);
  });
  it('replying after an inbound message counts as having read it', () => {
    const messages = [
      { senderId: GUEST, createdAt: T(10) },
      { senderId: HOST, createdAt: T(11) },
    ];
    expect(isUnread({ meId: HOST, messages, seenIso: null })).toBe(false);
  });
  it('old inquiry-era messages (before the baseline) are not unread', () => {
    const messages = [{ senderId: GUEST, createdAt: '2024-11-19T12:00:00.000Z' }];
    expect(isUnread({ meId: HOST, messages, seenIso: null })).toBe(false);
  });
  it('a conversation with no messages is not unread', () => {
    expect(isUnread({ meId: HOST, messages: [], seenIso: null })).toBe(false);
  });
});

describe('seenPatch()', () => {
  it('records the newest existing message, not a later client-supplied time', () => {
    expect(seenPatch({ privateData: {}, txId: 't', latestMessageIso: T(10), throughIso: T(23) })).toEqual({
      [seenKey('t')]: T(10),
    });
  });
  it('honors an earlier "through" (a message that arrived after the page rendered stays unread)', () => {
    expect(seenPatch({ privateData: {}, txId: 't', latestMessageIso: T(12), throughIso: T(10) })).toEqual({
      [seenKey('t')]: T(10),
    });
  });
  it('never moves backwards', () => {
    const privateData = { [seenKey('t')]: T(12) };
    expect(seenPatch({ privateData, txId: 't', latestMessageIso: T(12), throughIso: T(9) })).toBeNull();
  });
});

describe('read state end to end (fake Sharetribe)', () => {
  it('unread conversation -> open/read -> reload -> new inbound -> outbound reply', async () => {
    const be = backend();
    be.open('tx1');
    be.say('tx1', GUEST, T(10));
    const phone = device(be, HOST);

    // unread conversation
    let u = await phone.unread();
    expect(u.map(x => [x.transactionId, x.role, x.otherName])).toEqual([['tx1', 'provider', 'Sneakers G']]);

    // open/read
    const r = await phone.view('tx1', T(10));
    expect(r.code).toBe(200);
    expect(r.body.seenAt).toBe(T(10));
    expect(await phone.unread()).toEqual([]);

    // reload: a brand-new session reads only the persisted state
    expect(await device(be, HOST).unread()).toEqual([]);

    // new inbound message makes it unread again
    be.say('tx1', GUEST, T(11));
    expect((await phone.unread()).map(x => x.transactionId)).toEqual(['tx1']);

    // outbound reply: no unread for me, and it stays read
    be.say('tx1', HOST, T(12));
    expect(await phone.unread()).toEqual([]);
  });

  it('my outgoing message never creates an unread count for me, and does for the guest', async () => {
    const be = backend();
    be.open('tx1');
    be.say('tx1', HOST, T(10));
    expect(await device(be, HOST).unread()).toEqual([]);
    expect((await device(be, GUEST).unread()).map(x => [x.transactionId, x.role])).toEqual([
      ['tx1', 'customer'],
    ]);
  });

  it('two devices share persisted state; concurrent reads of different threads both stick', async () => {
    const be = backend();
    be.open('tx1');
    be.open('tx2');
    be.say('tx1', GUEST, T(10));
    be.say('tx2', GUEST, T(10));
    const phone = device(be, HOST);
    const laptop = device(be, HOST);
    expect((await laptop.unread()).length).toBe(2);

    await Promise.all([phone.view('tx1', T(10)), laptop.view('tx2', T(10))]);
    expect(await phone.unread()).toEqual([]);
    expect(await laptop.unread()).toEqual([]);
    expect(be.users[HOST].privateData).toEqual({
      [seenKey('tx1')]: T(10),
      [seenKey('tx2')]: T(10),
    });
  });

  it('viewing again with nothing new writes nothing', async () => {
    const be = backend();
    be.open('tx1');
    be.say('tx1', GUEST, T(10));
    const d = device(be, HOST);
    await d.view('tx1', T(10));
    await d.view('tx1', T(10));
    expect(be.writes).toHaveLength(1);
  });

  it('a non-participant cannot mark a conversation', async () => {
    const be = backend();
    be.open('tx1', 'someone-else', 'another');
    be.say('tx1', 'another', T(10));
    const r = await device(be, HOST).view('tx1', T(10));
    expect(r.code).toBe(403);
    expect(be.writes).toHaveLength(0);
  });

  it('the real Ledyard case: two old inquiry-state threads are not "2 guests sent you messages"', async () => {
    const be = backend();
    be.open('sneakers');
    be.open('other');
    be.say('sneakers', GUEST, '2026-09-16T18:51:43.146Z');
    be.say('other', GUEST, '2026-08-01T12:00:00.000Z');
    expect(await device(be, HOST).unread()).toEqual([]);
  });

  it('falls back to per-conversation message reads if the include is rejected', async () => {
    const be = backend();
    be.rejectMessagesInclude = true;
    be.open('tx1');
    be.open('tx2');
    be.say('tx1', GUEST, T(10));
    be.say('tx2', HOST, T(10));
    const d = device(be, HOST);
    expect((await d.unread()).map(x => x.transactionId)).toEqual(['tx1']);
    await d.view('tx1', T(10));
    expect(await d.unread()).toEqual([]);
  });
});
