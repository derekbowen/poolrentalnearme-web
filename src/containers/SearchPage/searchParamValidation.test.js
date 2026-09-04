import {
  isExtendedDataParam,
  indexedExtendedDataParamNames,
  partitionExtendedDataParams,
} from './searchParamValidation';

// Mirrors the real PRNM listing-field shape from src/config/configListing.js.
// poolAmenities is indexed for search in production (verified: heated -> 44 of
// 124). poolType is NOT indexed in production (pub_poolType=indoor -> 124),
// so it is modelled here as indexForSearch: false.
const listingFieldsConfig = [
  {
    key: 'poolAmenities',
    scope: 'public',
    schemaType: 'multi-enum',
    filterConfig: { indexForSearch: true },
  },
  { key: 'poolType', scope: 'public', schemaType: 'enum', filterConfig: { indexForSearch: false } },
  { key: 'maxGuests', scope: 'public', schemaType: 'long', filterConfig: { indexForSearch: false } },
  { key: 'verifiedHost', scope: 'metadata', schemaType: 'boolean', filterConfig: { indexForSearch: true } },
];

const indexed = indexedExtendedDataParamNames(listingFieldsConfig);
const ALLOW = ['pub_listingType', 'pub_categoryLevel'];
const split = (params) => partitionExtendedDataParams(params, indexed, ALLOW);

describe('indexedExtendedDataParamNames', () => {
  it('includes only fields indexed for search, with the right prefix per scope', () => {
    expect(indexed).toEqual(['pub_poolAmenities', 'meta_verifiedHost']);
  });

  it('tolerates a missing or empty config rather than throwing', () => {
    expect(indexedExtendedDataParamNames()).toEqual([]);
    expect(indexedExtendedDataParamNames([{ key: 'x', scope: 'public' }])).toEqual([]);
  });
});

describe('isExtendedDataParam', () => {
  it('recognises pub_ and meta_ params', () => {
    expect(isExtendedDataParam('pub_poolAmenities')).toBe(true);
    expect(isExtendedDataParam('meta_verifiedHost')).toBe(true);
  });

  it('leaves ordinary search params alone', () => {
    ['bounds', 'keywords', 'sort', 'price', 'dates', 'page', 'address', 'origin'].forEach((p) =>
      expect(isExtendedDataParam(p)).toBe(false)
    );
  });
});

describe('partitionExtendedDataParams', () => {
  // ---- the four cases named in the bug report -------------------------------

  it('no filter: passes an empty search through untouched', () => {
    expect(split({})).toEqual({ valid: {}, unknown: [] });
  });

  it('valid category: an indexed field is honoured', () => {
    const { valid, unknown } = split({ pub_poolAmenities: 'heated' });
    expect(valid).toEqual({ pub_poolAmenities: 'heated' });
    expect(unknown).toEqual([]);
  });

  it('nonexistent category: pub_category is rejected, NOT silently ignored', () => {
    // This is the production bug. `category` is not a PRNM listing field at all.
    ['heated', 'indoor', 'banana'].forEach((value) => {
      const { valid, unknown } = split({ pub_category: value });
      expect(unknown).toEqual(['pub_category']);
      expect(valid).toEqual({});
    });
  });

  it('a field that exists locally but is NOT indexed in production is rejected', () => {
    // pub_poolType=indoor returns all 124 today. It must not be treated as a
    // working filter just because poolType appears in configListing.js.
    expect(split({ pub_poolType: 'indoor' }).unknown).toEqual(['pub_poolType']);
    expect(split({ pub_maxGuests: '10,100' }).unknown).toEqual(['pub_maxGuests']);
  });

  // ---- nothing else may regress --------------------------------------------

  it('unrelated filters keep working alongside a valid category', () => {
    const params = {
      pub_poolAmenities: 'heated',
      bounds: '33.9,-111.9,33.2,-112.4',
      keywords: 'saltwater',
      sort: '-createdAt',
      price: '0,10000',
      page: 2,
    };
    const { valid, unknown } = split(params);
    expect(valid).toEqual(params);
    expect(unknown).toEqual([]);
  });

  it('city/state filtering still works when combined with a category', () => {
    const params = {
      pub_poolAmenities: 'heated',
      bounds: '33.9,-111.9,33.2,-112.4',
      address: 'Phoenix, Arizona',
    };
    expect(split(params)).toEqual({ valid: params, unknown: [] });
  });

  it('one bad param does not discard the good ones', () => {
    const { valid, unknown } = split({
      pub_poolAmenities: 'heated',
      pub_category: 'indoor',
      bounds: '1,2,3,4',
    });
    expect(valid).toEqual({ pub_poolAmenities: 'heated', bounds: '1,2,3,4' });
    expect(unknown).toEqual(['pub_category']);
  });

  it('multiple unknown params are all reported', () => {
    const { unknown } = split({ pub_category: 'a', meta_bogus: 'b' });
    expect(unknown).toEqual(['pub_category', 'meta_bogus']);
  });

  // ---- built-ins that are not listing fields --------------------------------

  it('keeps pub_listingType, which is a built-in filter rather than a listing field', () => {
    expect(split({ pub_listingType: 'hourly-pool' })).toEqual({
      valid: { pub_listingType: 'hourly-pool' },
      unknown: [],
    });
  });

  it('keeps the nested category tree params', () => {
    const params = { pub_categoryLevel1: 'pools', pub_categoryLevel2: 'backyard' };
    expect(split(params)).toEqual({ valid: params, unknown: [] });
  });

  it('multi-enum values pass through verbatim, including has_all/has_any', () => {
    ['heated', 'heated,hot_tub', 'has_all:heated,hot_tub', 'has_any:heated,hot_tub'].forEach((v) => {
      expect(split({ pub_poolAmenities: v }).valid).toEqual({ pub_poolAmenities: v });
    });
  });
});
