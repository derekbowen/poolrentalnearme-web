const { types } = require('sharetribe-flex-sdk');
const { transactionLineItems } = require('./lineItems');
const { variantMinHours, selectDurationTier } = require('./durationTiers');

const { Money } = types;
const HOUR = 60 * 60 * 1000;

// Shape of the real "Per hour" / "3+ hours" listing (floats as stored).
const listing = (publicData = {}) => ({
  id: { uuid: 'l1' },
  attributes: {
    price: new Money(10000, 'USD'),
    availabilityPlan: { timezone: 'America/Chicago' },
    publicData: {
      unitType: 'hour',
      priceVariationsEnabled: true,
      priceVariants: [
        { name: 'Per hour', priceInSubunits: 9000.0 },
        { name: '3+ hours', priceInSubunits: 7500.0 },
      ],
      ...publicData,
    },
  },
});
const order = (hours, priceVariantName) => {
  const start = new Date(Date.now() + 10 * 24 * HOUR);
  start.setUTCMinutes(0, 0, 0);
  return {
    bookingStart: start,
    bookingEnd: new Date(start.getTime() + hours * HOUR),
    priceVariantName,
  };
};
const commission = { percentage: 15 };
const hourLine = (items) => items.find((i) => i.code === 'line-item/hour');

describe('duration tiers (3+ hour rate)', () => {
  it('reads the minimum from minHours or a leading "N+ hours" name only', () => {
    expect(variantMinHours({ name: '3+ hours' })).toBe(3);
    expect(variantMinHours({ name: 'Per hour' })).toBe(null);
    expect(variantMinHours({ name: 'Weekend', minHours: 4 })).toBe(4);
    expect(variantMinHours({ name: '10+ guests' })).toBe(null);
  });

  it('a 2-hour booking cannot receive the 3+ hour rate', () => {
    const items = transactionLineItems(
      listing(),
      order(2, '3+ hours'),
      { percentage: 0 },
      commission
    );
    const line = hourLine(items);
    expect(line.unitPrice.amount).toBe(9000);
    expect(line.quantity.toString()).toBe('2');
  });

  it('a 3-hour booking receives the 3+ hour rate', () => {
    const items = transactionLineItems(
      listing(),
      order(3, '3+ hours'),
      { percentage: 0 },
      commission
    );
    expect(hourLine(items).unitPrice.amount).toBe(7500);
    expect(hourLine(items).quantity.toString()).toBe('3');
  });

  it('auto-selects the 3+ hour rate for a qualifying booking even if the guest chose "Per hour"', () => {
    const items = transactionLineItems(
      listing(),
      order(4, 'Per hour'),
      { percentage: 0 },
      commission
    );
    expect(hourLine(items).unitPrice.amount).toBe(7500);
  });

  it('standard-rate booking still works (Per hour, 1 hour, 15% guest fee)', () => {
    const items = transactionLineItems(
      listing(),
      order(1, 'Per hour'),
      { percentage: 0 },
      commission
    );
    expect(hourLine(items).unitPrice.amount).toBe(9000);
    const fee = items.find((i) => i.code === 'line-item/customer-commission');
    expect(fee.percentage).toBe(15);
    expect(fee.unitPrice.amount).toBe(9000);
  });

  it('no tier name sent → listing base price, unchanged', () => {
    const items = transactionLineItems(
      listing(),
      order(3, undefined),
      { percentage: 0 },
      commission
    );
    expect(hourLine(items).unitPrice.amount).toBe(10000);
  });

  it('listings without duration tiers keep name-based selection', () => {
    const pd = {
      priceVariants: [
        { name: 'Small party', priceInSubunits: 5000 },
        { name: 'Large party', priceInSubunits: 8000 },
      ],
    };
    const items = transactionLineItems(
      listing(pd),
      order(2, 'Large party'),
      { percentage: 0 },
      commission
    );
    expect(hourLine(items).unitPrice.amount).toBe(8000);
  });

  it('a per-date calendar price still wins over any tier', () => {
    const o = order(3, '3+ hours');
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(
      o.bookingStart
    );
    const pd = { availability: { dateOverrides: { [key]: { pricePerHour: 6000 } } } };
    const items = transactionLineItems(listing(pd), o, { percentage: 0 }, commission);
    expect(hourLine(items).unitPrice.amount).toBe(6000);
  });

  it('only tiers the duration reaches are eligible', () => {
    const tiers = [
      { name: 'Per hour', priceInSubunits: 9000 },
      { name: '3+ hours', priceInSubunits: 7500 },
      { name: '6+ hours', priceInSubunits: 6000 },
    ];
    expect(selectDurationTier(tiers, 2.5, '6+ hours').variant.name).toBe('Per hour');
    expect(selectDurationTier(tiers, 5, '6+ hours').variant.name).toBe('3+ hours');
    expect(selectDurationTier(tiers, 6, 'Per hour').variant.name).toBe('6+ hours');
    expect(selectDurationTier([tiers[1]], 2, '3+ hours').variant).toBe(null);
  });
});
