/**
 * External Ads Connector (Google Ads / Meta / Bing)
 * ──────────────────────────────────────────────────
 * Premium Boost tier pools every host's external ad budget into ONE
 * PRNM-owned ad account per network, then spreads impressions across
 * listings based on qualification (open availability + weather).
 *
 * Architecture:
 *
 *   1 Google Ads MCC account (PRNM-owned)
 *     └─ 1 Performance Max campaign per geo (city)
 *         └─ 1 Asset Group per BOOSTED listing in that geo
 *             ├─ headline: listing title
 *             ├─ description: AI-generated from listing copy
 *             ├─ images: listing photos
 *             ├─ URL: poolrentalnearme.com/l/{slug}/{id}?utm_source=google_ads&...
 *             └─ ENABLED/PAUSED flipped by syncBoostCampaigns cron
 *                based on availability + weather
 *
 * Same pattern for Meta (Business Manager → Campaign → Ad Set per
 * listing) and Bing (customer → campaign → ad group per listing).
 *
 * The pooling advantage:
 *   - Google Smart Bidding ML trains on 100x more conversion data
 *     than any solo host could generate → lower CPA, smarter targeting
 *   - Shared negative keyword list across all hosts
 *   - Volume discounts on impression buys
 *   - One set of creative templates maintained centrally
 *
 * This file is a stub that defines the connector interface and returns
 * mock data until real API creds are set. When GOOGLE_ADS_CUSTOMER_ID
 * (and friends) are in env, the stubs swap for real calls transparently.
 */

const CHANNELS = {
  google_ads: {
    name: 'Google Ads',
    envCheck: () => !!process.env.GOOGLE_ADS_CUSTOMER_ID,
    targetCpaCents: 800,
  },
  meta_ads: {
    name: 'Meta',
    envCheck: () => !!process.env.META_AD_ACCOUNT_ID,
    targetCpaCents: 700,
  },
  bing_ads: {
    name: 'Bing',
    envCheck: () => !!process.env.BING_ADS_CUSTOMER_ID,
    targetCpaCents: 500,
  },
};

const mockCampaignId = (channel, listingId) =>
  `mock_${channel}_${listingId.slice(0, 8)}`;

/**
 * Create or update an asset group / ad set for a listing.
 * In mock mode, returns a synthetic id.
 * In real mode (when env vars set), calls the real network API.
 */
const upsertAssetGroup = async ({ channel, listing, geo, keywords }) => {
  const config = CHANNELS[channel];
  if (!config) throw new Error(`Unknown channel: ${channel}`);

  if (!config.envCheck()) {
    return {
      mock: true,
      channel,
      assetGroupId: mockCampaignId(channel, listing.id?.uuid || listing.id || 'unknown'),
      status: 'ENABLED',
      estimatedCpaCents: config.targetCpaCents,
      notes: `[mock] Would upsert ${config.name} asset group for listing ${listing.attributes?.title}`,
    };
  }

  // Real implementation — branched by channel
  if (channel === 'google_ads') {
    return upsertGoogleAdsAssetGroup({ listing, geo, keywords });
  }
  if (channel === 'meta_ads') {
    return upsertMetaAdSet({ listing, geo });
  }
  if (channel === 'bing_ads') {
    return upsertBingAdGroup({ listing, geo, keywords });
  }
};

/**
 * Google Ads Performance Max asset group creation.
 * Uses google-ads-api npm package.
 */
const upsertGoogleAdsAssetGroup = async ({ listing, geo, keywords }) => {
  // NOTE: real implementation requires:
  //   npm install google-ads-api
  //   env: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
  //        GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID,
  //        GOOGLE_ADS_REFRESH_TOKEN
  //
  // Shape of the real call (pseudo):
  //
  //   const { GoogleAdsApi } = require('google-ads-api');
  //   const client = new GoogleAdsApi({ client_id, client_secret, developer_token });
  //   const customer = client.Customer({ customer_id, refresh_token });
  //
  //   const campaign = await customer.campaigns.create([{
  //     name: `PRNM PMax — ${geo.city}`,
  //     advertising_channel_type: 'PERFORMANCE_MAX',
  //     bidding_strategy_type: 'MAXIMIZE_CONVERSIONS',
  //     target_cpa: { target_cpa_micros: 8_000_000 }, // $8
  //     ...
  //   }]);
  //
  //   const assetGroup = await customer.assetGroups.create([{
  //     campaign: campaign.resource_name,
  //     name: listing.attributes.title,
  //     final_urls: [buildListingUrl(listing, 'google_ads')],
  //     status: 'ENABLED',
  //   }]);
  //
  //   // Attach creatives (headlines, descriptions, images)...
  //
  //   return { assetGroupId: assetGroup.resource_name, ... };

  throw new Error('Google Ads real-mode not yet wired. Set GOOGLE_ADS_* env vars.');
};

const upsertMetaAdSet = async ({ listing, geo }) => {
  // NOTE: real implementation requires:
  //   npm install facebook-nodejs-business-sdk
  //   env: META_AD_ACCOUNT_ID, META_ACCESS_TOKEN, META_APP_ID, META_APP_SECRET
  throw new Error('Meta Ads real-mode not yet wired. Set META_* env vars.');
};

const upsertBingAdGroup = async ({ listing, geo, keywords }) => {
  // NOTE: real implementation requires:
  //   npm install @microsoft/bingads
  //   env: BING_ADS_CUSTOMER_ID, BING_ADS_ACCOUNT_ID,
  //        BING_ADS_DEVELOPER_TOKEN, BING_ADS_REFRESH_TOKEN
  throw new Error('Bing Ads real-mode not yet wired. Set BING_ADS_* env vars.');
};

/**
 * Flip an existing asset group ENABLED or PAUSED.
 * Called by the sync cron when a host becomes fully booked (pause)
 * or re-opens availability (enable).
 */
const setAssetGroupStatus = async ({ channel, assetGroupId, status }) => {
  const config = CHANNELS[channel];
  if (!config || !config.envCheck()) {
    return { mock: true, channel, assetGroupId, status, applied: false };
  }
  // Real API call would go here, e.g.:
  //   customer.assetGroups.update([{ resource_name: assetGroupId, status }])
  throw new Error(`${channel} real-mode not yet wired.`);
};

/**
 * Pull conversion / cost data from the network for reporting.
 * Returns { impressions, clicks, conversions, costCents } per listing.
 */
const pullPerformance = async ({ channel, assetGroupId, dateRange }) => {
  const config = CHANNELS[channel];
  if (!config || !config.envCheck()) {
    // Return synthetic mock data so the dashboard has numbers to show in dev.
    return {
      mock: true,
      channel,
      assetGroupId,
      impressions: Math.floor(Math.random() * 500) + 100,
      clicks: Math.floor(Math.random() * 40) + 5,
      conversions: Math.floor(Math.random() * 4),
      costCents: Math.floor(Math.random() * 2000) + 200,
    };
  }
  throw new Error(`${channel} real-mode not yet wired.`);
};

/**
 * Keyword templates expanded for a given geo.
 * Called when creating a new asset group for a listing.
 */
const expandKeywords = geo => {
  const templates = [
    'pool rental {city}',
    'rent a pool {city}',
    'rent a pool near me',
    'swim for a day {city}',
    'backyard pool rental {city}',
    'private pool rental {city}',
    'hourly pool rental {city}',
    'pool party rental {city}',
  ];
  return templates.map(t => t.replace('{city}', geo.city || ''));
};

/**
 * Build a UTM-tagged URL for a listing that the ad network will use as
 * the landing page. Required for attribution.
 */
const buildListingUrl = (listing, channel) => {
  const root = process.env.ROOT_URL || 'https://www.poolrentalnearme.com';
  const slug = listing.attributes?.publicData?.slug || 'listing';
  const id = listing.id?.uuid || listing.id;
  const params = new URLSearchParams({
    utm_source: channel,
    utm_medium: 'cpc',
    utm_campaign: 'boost',
    listing_id: id,
  });
  return `${root}/l/${slug}/${id}?${params.toString()}`;
};

module.exports = {
  CHANNELS,
  upsertAssetGroup,
  setAssetGroupStatus,
  pullPerformance,
  expandKeywords,
  buildListingUrl,
};
