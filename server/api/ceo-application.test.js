jest.mock('../api-util/emailit', () => ({ sendViaEmailit: jest.fn() }));
jest.mock('../extensions/sms-messaging/mod/notify/twsend', () => jest.fn());
jest.mock('../concierge/config', () => ({ DEREK: '+15555550123' }));

const { sendViaEmailit } = require('../api-util/emailit');
const twsend = require('../extensions/sms-messaging/mod/notify/twsend');
const handler = require('./ceo-application');

const VALID = {
  name: 'Pat Host',
  email: 'pat@example.org',
  phone: '555-555-0100',
  location: 'Tampa, FL',
  platforms: 'Swimply, Pool Rental Near Me',
  why: 'I have hosted two pools for four years, built and sold a landscaping company, and I coach other hosts.',
};

let ipSeq = 0;
const call = async (body, ip) => {
  const res = {
    code: 200,
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  await handler({ body, headers: { 'x-forwarded-for': ip || `10.0.0.${++ipSeq}` } }, res);
  return res;
};

beforeEach(() => {
  sendViaEmailit.mockReset().mockResolvedValue({ id: 'em_1' });
  twsend.mockReset().mockResolvedValue({ sid: 'SM1' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/ceo-application', () => {
  it('emails the full application to Derek (reply-to applicant) and texts him', async () => {
    const res = await call(VALID);
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const mail = sendViaEmailit.mock.calls[0][0];
    expect(mail.to).toBe('derek@poolrentalnearme.com');
    expect(mail.replyTo).toBe('pat@example.org');
    expect(mail.subject).toBe('Operating CEO application: Pat Host');
    expect(mail.html).toContain('built and sold a landscaping company');
    expect(mail.text).toContain('Tampa, FL');
    const sms = twsend.mock.calls[0][0];
    expect(sms.phoneNumber).toBe('+15555550123');
    expect(sms.body).toMatch(
      /new Operating CEO application from Pat Host \(Tampa, FL\)\. Full application emailed/
    );
  });

  it('rejects missing required fields and short answers without sending anything', async () => {
    expect((await call({ ...VALID, phone: '' })).code).toBe(400);
    expect((await call({ ...VALID, email: 'not-an-email' })).code).toBe(400);
    expect((await call({ ...VALID, why: 'Because.' })).code).toBe(400);
    expect(sendViaEmailit).not.toHaveBeenCalled();
    expect(twsend).not.toHaveBeenCalled();
  });

  it('honeypot submissions look successful but send nothing', async () => {
    const res = await call({ ...VALID, website2: 'http://spam' });
    expect(res.body).toEqual({ ok: true });
    expect(sendViaEmailit).not.toHaveBeenCalled();
    expect(twsend).not.toHaveBeenCalled();
  });

  it('never loses an application: email failure logs it in full and the text says so', async () => {
    sendViaEmailit.mockRejectedValue(Object.assign(new Error('down'), { status: 503 }));
    const res = await call(VALID);
    expect(res.body).toEqual({ ok: true });
    const logged = console.error.mock.calls.find((c) => c[0] === 'CEO_APPLICATION_FALLBACK');
    expect(JSON.parse(logged[1])).toMatchObject({ name: 'Pat Host', why: VALID.why });
    expect(twsend.mock.calls[0][0].body).toMatch(/EMAIL FAILED - saved in server log/);
  });

  it('an SMS failure does not fail the submission', async () => {
    twsend.mockRejectedValue(new Error('twilio'));
    expect((await call(VALID)).body).toEqual({ ok: true });
    expect(sendViaEmailit).toHaveBeenCalledTimes(1);
  });

  it('escapes HTML from applicants and caps field length', async () => {
    await call({ ...VALID, name: '<script>x</script>', why: `${'a'.repeat(7000)} long enough` });
    const mail = sendViaEmailit.mock.calls[0][0];
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.text.length).toBeLessThan(6000 + 1000);
  });

  it('limits repeated submissions from one address', async () => {
    const codes = [];
    // eslint-disable-next-line no-await-in-loop
    for (let i = 0; i < 7; i++) codes.push((await call(VALID, '203.0.113.9')).code);
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes[5]).toBe(429);
  });
});
