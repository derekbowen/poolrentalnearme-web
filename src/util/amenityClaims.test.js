import { ADVANTAGE_FACT_KEYS, corroboratedAdvantages } from './amenityClaims';

describe('corroboratedAdvantages', () => {
  it('Backyard Oasis CT (Ledyard): no Heated pool — the host has a hot tub, not a heated pool', () => {
    // Exact publicData on listing 6888401b as of 2026-09-22.
    const publicData = {
      advantagesSelection: [
        'shaded-area-nearby',
        'night-lighting',
        'heated-pool',
        'pool-cleaning-included',
        'spa-and-sauna-nearby',
        'music-system',
        'fire-pit-nearby',
      ],
      poolAmenities: [
        'deep_end',
        'diving_board',
        'hot_tub',
        'bbq',
        'covered_seating',
        'restroom',
        'fenced',
        'evening_lights',
        'changing_area',
        'wifi',
        'parking',
        'cameras',
      ],
    };
    const shown = corroboratedAdvantages(publicData);
    expect(shown).toEqual(['night-lighting']);
    expect(shown).not.toContain('heated-pool');
    expect(shown).not.toContain('spa-and-sauna-nearby');
    // music-system is ticked as a highlight but sound_system is not in the
    // host's amenity list, so it is not asserted either.
    expect(shown).not.toContain('music-system');
  });

  it('hot tub never implies a heated pool', () => {
    expect(
      corroboratedAdvantages({ advantagesSelection: ['heated-pool'], poolAmenities: ['hot_tub'] })
    ).toEqual([]);
  });

  it('hot tub never implies spa & sauna', () => {
    expect(
      corroboratedAdvantages({
        advantagesSelection: ['spa-and-sauna-nearby'],
        poolAmenities: ['hot_tub'],
      })
    ).toEqual([]);
  });

  it('heated pool shows when the host explicitly selected `heated`', () => {
    expect(
      corroboratedAdvantages({ advantagesSelection: ['heated-pool'], poolAmenities: ['heated'] })
    ).toEqual(['heated-pool']);
  });

  it('a free-text amenity label is not the factual key', () => {
    expect(
      corroboratedAdvantages({
        advantagesSelection: ['heated-pool'],
        poolAmenities: ['Heated indoor pool'],
      })
    ).toEqual([]);
  });

  it('diving board', () => {
    expect(
      corroboratedAdvantages({ advantagesSelection: ['diving-board'], poolAmenities: ['diving_board'] })
    ).toEqual(['diving-board']);
    expect(
      corroboratedAdvantages({ advantagesSelection: ['diving-board'], poolAmenities: ['deep_end'] })
    ).toEqual([]);
  });

  it('water slide', () => {
    expect(
      corroboratedAdvantages({ advantagesSelection: ['water-slide'], poolAmenities: ['slide'] })
    ).toEqual(['water-slide']);
    expect(corroboratedAdvantages({ advantagesSelection: ['water-slide'], poolAmenities: [] })).toEqual(
      []
    );
  });

  it('sound system', () => {
    expect(
      corroboratedAdvantages({ advantagesSelection: ['music-system'], poolAmenities: ['sound_system'] })
    ).toEqual(['music-system']);
    expect(
      corroboratedAdvantages({ advantagesSelection: ['music-system'], poolAmenities: ['wifi'] })
    ).toEqual([]);
  });

  it('evening lighting', () => {
    expect(
      corroboratedAdvantages({
        advantagesSelection: ['night-lighting'],
        poolAmenities: ['evening_lights'],
      })
    ).toEqual(['night-lighting']);
  });

  it('suppresses marketing claims that no factual amenity can confirm', () => {
    const unsupported = [
      'shaded-area-nearby',
      'pool-cleaning-included',
      'fire-pit-nearby',
      'spa-and-sauna-nearby',
      'private-access',
      'panoramic-views',
      'poolside-dining-area',
      'eco-friendly-filtration',
      'lifeguard-on-duty',
    ];
    // Even with every factual amenity ticked, none of these can render.
    const everything = [
      'fenced', 'evening_lights', 'parking', 'restroom', 'deep_end', 'bbq',
      'covered_seating', 'wifi', 'sound_system', 'cameras', 'changing_area',
      'heated', 'hot_tub', 'saltwater', 'pet_friendly', 'diving_board', 'slide',
      'ada', 'indoor',
    ];
    expect(
      corroboratedAdvantages({ advantagesSelection: unsupported, poolAmenities: everything })
    ).toEqual([]);
  });

  it('only exact mappings exist, and none is an inference', () => {
    expect(ADVANTAGE_FACT_KEYS).toEqual({
      'heated-pool': 'heated',
      'night-lighting': 'evening_lights',
      'diving-board': 'diving_board',
      'water-slide': 'slide',
      'music-system': 'sound_system',
    });
    expect(Object.values(ADVANTAGE_FACT_KEYS)).not.toContain('hot_tub');
  });

  it('keeps the host order, drops duplicates, tolerates junk', () => {
    expect(
      corroboratedAdvantages({
        advantagesSelection: ['water-slide', 'heated-pool', 'water-slide', 'nonsense'],
        poolAmenities: ['heated', 'slide', { name: 'object' }, null],
      })
    ).toEqual(['water-slide', 'heated-pool']);
    expect(corroboratedAdvantages(undefined)).toEqual([]);
    expect(corroboratedAdvantages({})).toEqual([]);
  });

  it('never mutates the listing data it reads', () => {
    const pd = { advantagesSelection: ['heated-pool'], poolAmenities: ['hot_tub'] };
    const before = JSON.stringify(pd);
    corroboratedAdvantages(pd);
    expect(JSON.stringify(pd)).toBe(before);
  });
});
