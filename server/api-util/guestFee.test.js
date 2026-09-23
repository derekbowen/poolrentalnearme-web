const { types } = require('sharetribe-flex-sdk');
const { transactionLineItems } = require('./lineItems');
const { calculateLineTotal } = require('./lineItemHelpers');
const { feeSubunits } = require('./guestFee');
const { allInSubunits } = require('../../src/util/allInPrice');

const { Money } = types;
const HOUR = 3600e3;
const START = Date.UTC(2031, 5, 3, 16); // far future: clear of advance-notice rules

const listingAt = (priceSubunits, amenities = []) => ({
  attributes: {
    price: new Money(priceSubunits, 'USD'),
    availabilityPlan: { timezone: 'America/New_York' },
    publicData: {
      unitType: 'hour',
      amenities: amenities.map((amount, i) => ({ id: `a${i}`, name: `Add-on ${i}`, price: { amount, currency: 'USD' } })),
    },
  },
});

const lineItemsFor = (priceSubunits, hours, amenities = []) =>
  transactionLineItems(
    listingAt(priceSubunits, amenities),
    {
      bookingStart: new Date(START),
      bookingEnd: new Date(START + hours * HOUR),
      amenities: amenities.map((_, i) => `a${i}`),
    },
    { percentage: 0 },
    { percentage: 15 }
  );

// What the order panel and checkout preview show: our server's line totals.
const previewTotal = lineItems =>
  lineItems
    .filter(li => li.includeFor.includes('customer'))
    .reduce((t, li) => t + calculateLineTotal(li).amount, 0);

// What Sharetribe charges, modelled WITHOUT any rounding: every customer line
// must be whole cents already (unitPrice x integer quantity). A line that would
// need rounding is reported instead of guessed.
const chargedTotal = lineItems => {
  let total = 0;
  for (const li of lineItems.filter(l => l.includeFor.includes('customer'))) {
    if (li.percentage != null) return { needsRounding: li.code };
    const exact = li.unitPrice.amount * li.quantity;
    if (!Number.isInteger(exact)) return { needsRounding: li.code };
    total += exact;
  }
  return { total };
};

const DURATIONS = [1, 2, 3, 4, 6, 8, 12];
const ADDON_SETS = [[], [1000], [999, 2550], [1, 3333, 12345]];

describe('guest fee rounding', () => {
  it('server fee per line == client all-in, for every cent from $0.00 to $500.00', () => {
    for (let a = 0; a <= 50000; a++) {
      expect(allInSubunits(a)).toBe(a + feeSubunits(a, 15));
    }
  });

  it('the fee line is whole cents, 15% per base line, never a percentage line', () => {
    const li = lineItemsFor(3890, 3, [1000]);
    const fee = li.find(l => l.code === 'line-item/customer-commission');
    expect(fee.percentage).toBeUndefined();
    expect(fee.quantity).toBe(1);
    // 3 x $38.90 = $116.70 -> fee 1751 (17.505 half-up); $10 -> fee 150
    expect(fee.unitPrice.amount).toBe(1751 + 150);
  });
});

describe('displayed total == checkout, every cent host price', () => {
  it(`hourly $1.00-$500.00 x ${DURATIONS.join('/')}h x ${ADDON_SETS.length} add-on sets`, () => {
    let checked = 0;
    for (let p = 100; p <= 50000; p++) {
      for (const h of DURATIONS) {
        for (const addons of ADDON_SETS) {
          const li = lineItemsFor(p, h, addons);
          const charged = chargedTotal(li);
          if (charged.needsRounding) throw new Error(`$${p / 100} x ${h}h: ${charged.needsRounding} needs rounding`);
          if (previewTotal(li) !== charged.total) {
            throw new Error(`$${p / 100} x ${h}h + ${addons}: preview ${previewTotal(li)} != charged ${charged.total}`);
          }
          checked++;
        }
      }
    }
    expect(checked).toBe(49901 * DURATIONS.length * ADDON_SETS.length);
  }, 900000);

  it('each add-on adds exactly its displayed all-in price at checkout', () => {
    for (let p = 100; p <= 50000; p += 7) {
      for (const h of [1, 2, 3]) {
        const without = previewTotal(lineItemsFor(p, h, []));
        for (const a of [1, 999, 1000, 1150, 2550, 3333, 4999]) {
          expect(previewTotal(lineItemsFor(p, h, [a])) - without).toBe(allInSubunits(a));
        }
      }
    }
  }, 900000);

  it('Derek\'s example: a $10 add-on shows $11.50 and adds $11.50', () => {
    expect(allInSubunits(1000)).toBe(1150);
    const without = previewTotal(lineItemsFor(5000, 2, []));
    expect(previewTotal(lineItemsFor(5000, 2, [1000])) - without).toBe(1150);
  });

  it('half-hour durations: whole cents whenever hourly x hours is whole cents', () => {
    // 1.5h / 2.5h are not bookable today (the picker is whole hours). When the
    // hours line itself lands on a half cent (e.g. $38.95 x 1.5 = $58.425),
    // Sharetribe must round it, and that rounding is unverified — the 30-minute
    // release has to price half-hours in whole cents first.
    let exact = 0;
    let half = 0;
    for (let p = 100; p <= 50000; p++) {
      for (const h of [1.5, 2.5]) {
        const li = lineItemsFor(p, h, [1000]);
        const charged = chargedTotal(li);
        if (charged.needsRounding) {
          expect(charged.needsRounding).toBe('line-item/hour');
          half++;
        } else {
          expect(previewTotal(li)).toBe(charged.total);
          exact++;
        }
      }
    }
    expect(exact + half).toBe(49901 * 2);
    expect(half).toBe(24950 * 2); // exactly the odd-cent hourly prices, at 1.5h and 2.5h
  }, 900000);
});
