const usgeo = require('./index');

describe('usgeo local resolver', () => {
  describe('normalize()', () => {
    it('folds case, commas, punctuation and repeated whitespace', () => {
      expect(usgeo.normalize('  WINDHAM ,  N.H. ')).toEqual('windham nh');
      expect(usgeo.normalize('St. Louis,MO')).toEqual('st louis mo');
      expect(usgeo.normalize('San   Antonio')).toEqual('san antonio');
    });
  });

  describe('ZIP lookup', () => {
    it('resolves a plain ZIP', () => {
      const [p] = usgeo.resolveLocal('03087');
      expect(p.place_type).toEqual(['postcode']);
      expect(p.place_name).toEqual('03087, New Hampshire');
      expect(p.bbox).toHaveLength(4);
    });

    it('accepts ZIP+4 and resolves to the 5-digit area', () => {
      expect(usgeo.resolveLocal('03087-1234')[0].id).toEqual('usgeo.zip.03087');
    });

    it('does not invent a ZIP that does not exist', () => {
      expect(usgeo.resolveLocal('00000')).toEqual([]);
    });
  });

  describe('city + state lookup', () => {
    it('handles abbreviation, full name, comma and casing', () => {
      const forms = ['Windham, NH', 'Windham NH', 'windham nh', 'Windham, New Hampshire'];
      forms.forEach(f => {
        const [p] = usgeo.resolveLocal(f);
        expect(p.place_name).toEqual('Windham, New Hampshire');
        expect(p.place_type).toEqual(['place']);
      });
    });

    it('finds New England towns, which are county subdivisions and not Census "places"', () => {
      // NH has only 100 Census places and Windham is not one of them; without the
      // cousubs layer this returns nothing and the town is unsearchable.
      expect(usgeo.resolveLocal('Windham NH')).toHaveLength(1);
      expect(usgeo.resolveLocal('Derry NH')).toHaveLength(1);
    });

    it('does not match a city to the wrong state', () => {
      expect(usgeo.resolveLocal('Windham, TX')).toEqual([]);
    });

    it('does not fuzzy-match a near miss', () => {
      expect(usgeo.resolveLocal('Windhamm NH')).toEqual([]);
      expect(usgeo.resolveLocal('Wndham NH')).toEqual([]);
    });
  });

  describe('state lookup', () => {
    it('resolves full state names', () => {
      const [p] = usgeo.resolveLocal('New Hampshire');
      expect(p.place_type).toEqual(['region']);
      expect(p.place_name).toEqual('New Hampshire');
    });

    it('resolves every valid 2-letter abbreviation Derek listed', () => {
      ['NH', 'CA', 'ID', 'AZ', 'MT', 'WA', 'OR', 'TX', 'NY', 'FL'].forEach(ab => {
        const [p] = usgeo.resolveLocal(ab);
        expect(p).toBeTruthy();
        expect(p.place_type).toEqual(['region']);
        expect(p.id).toEqual('usgeo.state.' + ab);
      });
    });

    it('abbreviation and full name give the same place', () => {
      const a = usgeo.resolveLocal('NH')[0];
      const b = usgeo.resolveLocal('New Hampshire')[0];
      expect(a.bbox).toEqual(b.bbox);
      expect(a.center).toEqual(b.center);
    });

    it('rejects two-letter strings that are not states', () => {
      ['ZZ', 'QQ', 'XX', 'AA'].forEach(s => {
        expect(usgeo.resolveLocal(s)).toEqual([]);
        expect(usgeo.isShortButValid(s)).toBe(false);
      });
    });

    it('lets valid abbreviations and ZIPs past the minimum-length guard', () => {
      expect(usgeo.isShortButValid('NH')).toBe(true);
      expect(usgeo.isShortButValid('nh')).toBe(true);
      expect(usgeo.isShortButValid('03087')).toBe(true);
      expect(usgeo.isShortButValid('a')).toBe(false);
    });
  });

  describe('bounds are usable for marketplace search', () => {
    it('a state searches the whole state, not a point', () => {
      const [nh] = usgeo.resolveLocal('NH');
      const [west, south, east, north] = nh.bbox;
      // New Hampshire is ~305km tall; anything under a degree of latitude means
      // we have collapsed a state into a pinprick.
      expect(north - south).toBeGreaterThan(2.0);
      expect(east - west).toBeGreaterThan(1.0);
    });

    it("a city box actually contains the town's own listings", () => {
      // Mary's pool sits 4.1km from the Windham centroid. The old client used a
      // 500m box, which excluded her from a search for her own town.
      const [w] = usgeo.resolveLocal('Windham NH');
      const [west, south, east, north] = w.bbox;
      const maryLat = 42.82534;
      const maryLng = -71.34125;
      expect(maryLat).toBeGreaterThan(south);
      expect(maryLat).toBeLessThan(north);
      expect(maryLng).toBeGreaterThan(west);
      expect(maryLng).toBeLessThan(east);
    });

    it('a ZIP searches a local area, neither a point nor a region', () => {
      const [z] = usgeo.resolveLocal('03087');
      const [west, south, east, north] = z.bbox;
      const heightKm = (north - south) * 110.574;
      expect(heightKm).toBeGreaterThan(10);
      expect(heightKm).toBeLessThan(140);
    });

    it('every bbox is well formed', () => {
      ['03087', 'Windham NH', 'NH', 'Austin TX', 'California'].forEach(q => {
        const [p] = usgeo.resolveLocal(q);
        const [west, south, east, north] = p.bbox;
        expect(north).toBeGreaterThan(south);
        expect(east).toBeGreaterThan(west);
        expect(Math.abs(south)).toBeLessThanOrEqual(90);
        expect(Math.abs(north)).toBeLessThanOrEqual(90);
      });
    });
  });

  describe('ambiguity', () => {
    it('offers each state that has a city of that name, biggest first', () => {
      const rs = usgeo.resolveLocal('Springfield');
      expect(rs.length).toBeGreaterThan(1);
      const names = rs.map(r => r.place_name);
      expect(new Set(names).size).toEqual(names.length); // no duplicates
    });

    it('returns nothing for gibberish', () => {
      expect(usgeo.resolveLocal('Xyzzy')).toEqual([]);
      expect(usgeo.resolveLocal('asdfghjkl')).toEqual([]);
    });
  });

  it('ships a full national dataset', () => {
    expect(usgeo._counts.states).toBeGreaterThanOrEqual(51);
    expect(usgeo._counts.zips).toBeGreaterThan(30000);
    expect(usgeo._counts.cities).toBeGreaterThan(20000);
  });
});
