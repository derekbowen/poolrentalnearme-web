import { createIntl } from 'react-intl';
import IntlMessageFormat from 'intl-messageformat';
import { types as sdkTypes } from './sdkLoader';
import { CUSTOMER_BOOKING_FEE_PCT, formatMoney, priceWithBookingFee } from './currency';

const {
  calculateTotalPriceFromQuantity,
  calculateTotalPriceFromPercentage,
  calculateTotalFromLineItems,
} = require('../../server/api-util/lineItemHelpers');

const { Money } = sdkTypes;
const LOCALE = 'en-US'; // src/config/configDefault.js localization.locale
const intl = createIntl({ locale: LOCALE, messages: {} });
const usd = cents => new Money(cents, 'USD');

// What checkout charges for one unit: the base line plus the customer
// commission line, computed by the SAME server code that builds the
// transaction's line items (Decimal, ROUND_HALF_UP).
const checkoutTotalForOneUnit = baseCents => {
  const unitPrice = usd(baseCents);
  const order = { code: 'line-item/hour', unitPrice, quantity: 1, includeFor: ['customer'] };
  const fee = {
    code: 'line-item/customer-commission',
    unitPrice: calculateTotalPriceFromQuantity(unitPrice, 1),
    percentage: CUSTOMER_BOOKING_FEE_PCT,
    includeFor: ['customer'],
  };
  return calculateTotalFromLineItems([order, fee]);
};

// Sharetribe's transactional email templates format money with this exact
// message (ext/transaction-processes/**/templates/*.html, "format-money").
const EMAIL_FORMAT = '{amount,number,::.00} {currency}';
const emailMoney = money =>
  new IntlMessageFormat(EMAIL_FORMAT, LOCALE).format({
    amount: money.amount / 100,
    currency: money.currency,
  });

describe('formatMoney: fractional prices are valid currency', () => {
  it.each([
    [5000, '$50'],
    [5750, '$57.50'],
    [3450, '$34.50'],
    [11500, '$115'],
    [11385, '$113.85'],
    [8050, '$80.50'],
    [17250, '$172.50'],
    [2070, '$20.70'],
    [5, '$0.05'],
    [123456, '$1,234.56'],
    [100000, '$1,000'],
  ])('%i cents -> %s', (cents, expected) => {
    expect(formatMoney(intl, usd(cents))).toBe(expected);
  });

  it('never renders exactly one fraction digit, for any cent value up to $1,000', () => {
    for (let cents = 0; cents <= 100000; cents += 1) {
      const s = formatMoney(intl, usd(cents));
      expect(/\.\d$/.test(s)).toBe(false);
      if (cents % 100 !== 0) expect(/\.\d\d$/.test(s)).toBe(true);
    }
  });

  it('does not change the 15% renter fee', () => {
    expect(CUSTOMER_BOOKING_FEE_PCT).toBe(15);
    expect(priceWithBookingFee(usd(5000)).amount).toBe(5750);
  });
});

describe('listing page price == checkout price, to the penny', () => {
  it('for every base price from $1.00 to $500.00 in one-cent steps', () => {
    const mismatches = [];
    for (let base = 100; base <= 50000; base += 1) {
      const listed = priceWithBookingFee(usd(base));
      const charged = checkoutTotalForOneUnit(base);
      if (listed.amount !== charged.amount) mismatches.push([base, listed.amount, charged.amount]);
      else if (formatMoney(intl, listed) !== formatMoney(intl, charged)) {
        mismatches.push([base, 'format', formatMoney(intl, listed), formatMoney(intl, charged)]);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('the Backyard Oasis CT price: $50 base -> $57.50 on the page and at checkout', () => {
    const listed = priceWithBookingFee(usd(5000));
    const charged = checkoutTotalForOneUnit(5000);
    expect(formatMoney(intl, listed)).toBe('$57.50');
    expect(formatMoney(intl, charged)).toBe('$57.50');
  });

  it('half-cent fees round the way checkout rounds them (was 1 cent low on the page)', () => {
    // $38.90 x 15% = $5.835. Checkout (Decimal, ROUND_HALF_UP) charges $44.74.
    // The old float display showed $44.73.
    expect(priceWithBookingFee(usd(3890)).amount).toBe(4474);
    expect(checkoutTotalForOneUnit(3890).amount).toBe(4474);
    expect(formatMoney(intl, priceWithBookingFee(usd(3890)))).toBe('$44.74');
    expect(priceWithBookingFee(usd(4010)).amount).toBe(4612);
  });

  it('the fee line on its own formats as valid currency', () => {
    const fee = calculateTotalPriceFromPercentage(usd(5000), CUSTOMER_BOOKING_FEE_PCT);
    expect(formatMoney(intl, fee)).toBe('$7.50');
  });
});

describe('server-rendered output == hydrated client output', () => {
  it('formatting depends only on the amount and locale, so SSR and client agree', () => {
    // The server builds its own intl per request; the browser builds another.
    const serverIntl = createIntl({ locale: LOCALE, messages: {} });
    const clientIntl = createIntl({ locale: LOCALE, messages: {} });
    [5000, 5750, 3450, 11500, 11385, 17250].forEach(c => {
      expect(formatMoney(serverIntl, usd(c))).toBe(formatMoney(clientIntl, usd(c)));
    });
  });
});

describe('email formatting', () => {
  it('uses its own two-decimal template, and agrees with the page to the penny', () => {
    // Emails are rendered by Sharetribe from the template above, not by
    // formatMoney; this pins that they still state the same amount.
    [
      [5750, '57.50 USD', '$57.50'],
      [5000, '50.00 USD', '$50'],
      [11385, '113.85 USD', '$113.85'],
    ].forEach(([c, email, page]) => {
      expect(emailMoney(usd(c))).toBe(email);
      expect(formatMoney(intl, usd(c))).toBe(page);
      expect(Number(email.split(' ')[0])).toBe(Number(page.replace(/[$,]/g, '')));
    });
  });
});
