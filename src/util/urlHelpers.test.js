import { types as sdkTypes } from './sdkLoader';
import {
  createSlug,
  parseFloatNum,
  encodeLatLng,
  decodeLatLng,
  encodeLatLngBounds,
  decodeLatLngBounds,
  stringify,
  parse,
} from './urlHelpers';

const { LatLng, LatLngBounds } = sdkTypes;

const SPACE = encodeURIComponent(' ');
const COMMA = encodeURIComponent(',');

describe('urlHelpers', () => {
  describe('parseFloatNum()', () => {
    it('handles empty string (returns "")', () => {
      expect(createSlug('')).toEqual('no-slug');
    });

    it('handles space characters', () => {
      expect(createSlug('ice hockey    tournament')).toEqual('ice-hockey-tournament');
    });

    it('handles special characters', () => {
      expect(createSlug('ice hockey!%/@$€ for the win')).toEqual('ice-hockey-for-the-win');
    });

    it('handles multiple "-"', () => {
      expect(createSlug('testing ---- dashes')).toEqual('testing-dashes');
    });

    it('handles umlauts', () => {
      expect(createSlug('jääkiekko / pesäpallo')).toEqual('jaakiekko-pesapallo');
    });

    it('handles Emojis', () => {
      expect(createSlug('smiling 💩 emoji')).toEqual('smiling-emoji');
    });
  });

  describe('parseFloatNum()', () => {
    it('handles empty value', () => {
      expect(parseFloatNum('')).toBeNull();
    });

    it('handles non-numeric value', () => {
      expect(parseFloatNum('abc')).toBeNull();
    });

    it('handles int value with surrounding whitespace', () => {
      expect(parseFloatNum(' 123 \t')).toEqual(123);
    });

    it('handles float value', () => {
      expect(parseFloatNum('123.01')).toBeCloseTo(123.01, 2);
    });

    it('handles trailing chars', () => {
      expect(parseFloatNum('123abc')).toBeNull();
    });

    it('does not parse comma as a separator', () => {
      expect(parseFloatNum('10,20')).toBeNull();
    });
  });

  describe('LatLng serialisation', () => {
    it('encodes and decodes', () => {
      const location = new LatLng(40, 60);
      expect(decodeLatLng(encodeLatLng(location))).toEqual(location);
    });
  });

  describe('LatLngBounds serialisation', () => {
    it('encodes and decodes', () => {
      const bounds = new LatLngBounds(new LatLng(50, 70), new LatLng(30, 50));
      expect(decodeLatLngBounds(encodeLatLngBounds(bounds))).toEqual(bounds);
    });
  });

  describe('stringify()', () => {
    it('handles empty params', () => {
      expect(stringify({})).toEqual('');
    });

    it('sorts params', () => {
      const params = { b: 'B', c: 'C', a: 'A' };
      expect(stringify(params)).toEqual('a=A&b=B&c=C');
    });

    it('encodes values', () => {
      const params = {
        space: 'A and b',
        num: 123,
        bool: true,
        undef: undefined,
        nil: null,
      };
      expect(stringify(params)).toEqual(`bool=true&num=123&space=A${SPACE}and${SPACE}b`);
    });

    it('encodes SDK types', () => {
      const params = {
        origin: new LatLng(40, 60),
        bounds: new LatLngBounds(new LatLng(50, 70), new LatLng(30, 50)),
      };
      const origin = `40${COMMA}60`;
      const bounds = `50${COMMA}70${COMMA}30${COMMA}50`;
      expect(stringify(params)).toEqual(`bounds=${bounds}&origin=${origin}`);
    });
  });

  describe('parse()', () => {
    it('handles empty string', () => {
      expect(parse('')).toEqual({});
    });

    it('handles question mark', () => {
      expect(parse('?')).toEqual({});
    });

    it('decodes values', () => {
      const search = `bool1=true&bool2=false&num1=123&num2=-1.01&space=A${SPACE}and${SPACE}b`;
      expect(parse(search)).toEqual({
        space: 'A and b',
        num1: 123,
        num2: -1.01,
        bool2: false,
        bool1: true,
      });
    });

    it('decodes SDK types', () => {
      const origin = `40${COMMA}60`;
      const bounds = `50${COMMA}70${COMMA}30${COMMA}50`;
      const search = `bounds=${bounds}&origin=${origin}&invalid=a,10&badBounds=true`;
      const options = {
        latlng: ['origin', 'invalid'],
        latlngBounds: ['bounds', 'badBounds'],
      };
      expect(parse(search, options)).toEqual({
        origin: new LatLng(40, 60),
        invalid: null,
        bounds: new LatLngBounds(new LatLng(50, 70), new LatLng(30, 50)),
        badBounds: null,
      });
    });

    it('keeps SDK type info without options', () => {
      const origin = `40${COMMA}60`;
      const bounds = `50${COMMA}70${COMMA}30${COMMA}50`;
      const search = `bounds=${bounds}&origin=${origin}`;
      expect(parse(search)).toEqual({
        bounds: '50,70,30,50',
        origin: '40,60',
      });
    });
  });
});

describe('parseFloatNum trailing zeros (search-bounds regression)', () => {
  // A trailing zero in any bounds coordinate used to return null here, which
  // made decodeLatLngBounds return null, which dropped the `bounds` search
  // param, which made the search return every listing on the marketplace
  // instead of the ones near the guest. Reported by a New Hampshire host as
  // "I search my zip and it says there are no pools here".
  it('parses decimals with trailing zeros', () => {
    expect(parseFloatNum('42.60')).toEqual(42.6);
    expect(parseFloatNum('-71.90')).toEqual(-71.9);
    expect(parseFloatNum('42.0')).toEqual(42);
    expect(parseFloatNum('42.600000')).toEqual(42.6);
  });

  it('parses other valid spellings that do not round-trip via toString', () => {
    expect(parseFloatNum('+42.6')).toEqual(42.6);
    expect(parseFloatNum('.5')).toEqual(0.5);
    expect(parseFloatNum('1e2')).toEqual(100);
  });

  it('still rejects anything that is not a well-formed number', () => {
    expect(parseFloatNum('42abc')).toBeNull();
    expect(parseFloatNum('abc')).toBeNull();
    expect(parseFloatNum('4 2')).toBeNull();
    expect(parseFloatNum('4.2.3')).toBeNull();
    expect(parseFloatNum('--4')).toBeNull();
    expect(parseFloatNum('Infinity')).toBeNull();
    expect(parseFloatNum('')).toBeNull();
    expect(parseFloatNum(null)).toBeNull();
  });

  it('keeps a bounds string with trailing zeros intact end to end', () => {
    // The exact box that returned all 120 listings on the live site.
    const bounds = decodeLatLngBounds('45.31,-70.61,42.70,-72.56');
    expect(bounds).not.toBeNull();
    expect(bounds.ne.lat).toEqual(45.31);
    expect(bounds.sw.lat).toEqual(42.7);
  });
});
