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

  getPlaceDetails(prediction, currentLocationBoundsDistance) {
    if (this.getPredictionId(prediction) === CURRENT_LOCATION_ID) {
      return userLocation().then(latlng => {
        return {
          id: CURRENT_LOCATION_ID,
          predictionPlace: {},
          place: {
            address: '',
            origin: latlng,
            bounds: locationBounds(latlng, currentLocationBoundsDistance || 2000),
          },
        };
      });
    }
    const origin = placeOrigin(prediction);
    return Promise.resolve({
      id: this.getPredictionId(prediction),
      predictionPlace: {},
      place: {
        address: this.getPredictionAddress(prediction),
        origin,
        bounds: locationBounds(origin, GENERATED_BOUNDS_DEFAULT_DISTANCE),
      },
    });
  }
}

export default GeocoderCensus;
