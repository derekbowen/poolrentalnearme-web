import { types as sdkTypes } from '../../util/sdkLoader';
import { userLocation } from '../../util/maps';

const { LatLng: SDKLatLng, LatLngBounds: SDKLatLngBounds } = sdkTypes;

export const CURRENT_LOCATION_ID = 'current-location';

// c133: keyless geocoder backed by our own /api/geocode (US Census Bureau upstream).
// Exists because the Google Maps key has billing disabled, which broke address
// lookup in the listing wizard for every new host. Predictions follow the Mapbox
// feature shape (center [lng, lat], place_name, id) so the shared input component
// needs no changes. US-only by nature — which is the whole marketplace.
const GENERATED_BOUNDS_DEFAULT_DISTANCE = 500; // meters

const locationBounds = (latlng, distanceMeters) => {
  if (!latlng) {
    return null;
  }
  const latDelta = distanceMeters / 111320;
  const lngDelta = distanceMeters / (111320 * Math.max(0.2, Math.cos((latlng.lat * Math.PI) / 180)));
  return new SDKLatLngBounds(
    new SDKLatLng(latlng.lat + latDelta, latlng.lng + lngDelta),
    new SDKLatLng(latlng.lat - latDelta, latlng.lng - lngDelta)
  );
};

const placeOrigin = prediction => {
  if (prediction && Array.isArray(prediction.center) && prediction.center.length === 2) {
    // Coordinates are [longitude, latitude], mirroring Mapbox features.
    return new SDKLatLng(prediction.center[1], prediction.center[0]);
  }
  return null;
};

/**
 * c193: use the prediction's own extent when it has one.
 *
 * This previously ignored `bbox` entirely and built a 500m box around
 * centroid for EVERY prediction — so picking a town searched a half-kilometre
 * circle around the town centre, and picking a state searched a half-kilometre
 * circle around the state centroid. Windham NH's centroid is 4.1km from the
 * only pool in New Hampshire, so its host searched her own town and was told
 * there was nothing there.
 *
 * Street addresses legitimately want the tight default box; places, ZIPs and
 * states carry a bbox and should use it.
 *
 * bbox is [west, south, east, north], matching Mapbox.
 */
const placeBounds = prediction => {
  const bbox = prediction && prediction.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(n => Number.isFinite(n))) {
    return null;
  }
  const [west, south, east, north] = bbox;
  if (north <= south || east <= west) {
    return null;
  }
  return new SDKLatLngBounds(new SDKLatLng(north, east), new SDKLatLng(south, west));
};

export const GeocoderAttribution = () => null;

class GeocoderCensus {
  getPlacePredictions(search, countryLimit, locale) {
    return window
      .fetch('/api/geocode-suggest?q=' + encodeURIComponent(search), { method: 'GET' })
      .then(r => r.json())
      .then(data => ({
        search,
        predictions: (data && data.predictions) || [],
      }))
      .catch(() => ({ search, predictions: [] }));
  }

  getPredictionId(prediction) {
    return prediction.id;
  }

  getPredictionAddress(prediction) {
    if (prediction.predictionPlace) {
      // default prediction defined above
      return prediction.predictionPlace.address;
    }
    return prediction.place_name;
  }

  /**
   * Resolves to the place ITSELF - { address, origin, bounds } - and not to a
   * wrapper around it.
   *
   * This previously resolved to { id, predictionPlace, place: {...} }. The
   * caller does `search: place.address` and `selectedPlace: place`
   * (LocationAutocompleteInputImpl:325), so the wrapper made `search`
   * undefined and left `selectedPlace` with no `origin`. The visible result was
   * that picking an address from the dropdown BLANKED the field and left the
   * form insisting you pick one — on every host-facing address field on the
   * site, including the listing wizard, since c133.
   *
   * Both stock geocoders (GeocoderGoogleMaps:96, GeocoderMapbox:159) resolve
   * flat. This now matches them.
   */
  getPlaceDetails(prediction, currentLocationBoundsDistance) {
    if (this.getPredictionId(prediction) === CURRENT_LOCATION_ID) {
      return userLocation().then(latlng => {
        return {
          address: '',
          origin: latlng,
          bounds: locationBounds(latlng, currentLocationBoundsDistance || 2000),
        };
      });
    }
    const origin = placeOrigin(prediction);
    return Promise.resolve({
      address: this.getPredictionAddress(prediction),
      origin,
      bounds: placeBounds(prediction) || locationBounds(origin, GENERATED_BOUNDS_DEFAULT_DISTANCE),
    });
  }
}

export default GeocoderCensus;
