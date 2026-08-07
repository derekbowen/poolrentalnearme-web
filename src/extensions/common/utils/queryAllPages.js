import { denormalisedResponseEntities } from '../../../util/data';

const PER_PAGE = 100;
const BATCH_SIZE = 5;

/**
 * Fetches all pages of data from a Sharetribe API resource.
 * Fetches page 1 first to read totalPages, then fetches remaining pages in parallel batches
 * of BATCH_SIZE to avoid overwhelming the API.
 *
 * @param {Object} sdk - Sharetribe SDK instance
 * @param {string} resource - Name of the API resource to query (e.g., 'listings', 'users')
 * @param {Object} query - Query parameters to be passed to the API
 * @returns {Promise<Array>} Array of denormalized response entities from all pages combined
 */
const queryAllPages = async (sdk, resource, query) => {
  // Get first page and total pages count
  const initialResponse = await sdk[resource].query({ ...query, perPage: PER_PAGE });
  const totalPages = initialResponse?.data?.meta?.totalPages;

  // If only one page, return results immediately
  if (totalPages <= 1) {
    return denormalisedResponseEntities(initialResponse);
  }

  const remainingResponses = [];

  for (let startPage = 2; startPage <= totalPages; startPage += BATCH_SIZE) {
    const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPages);
    const batchPromises = [];
    for (let page = startPage; page <= endPage; page += 1) {
      batchPromises.push(sdk[resource].query({ ...query, page, perPage: PER_PAGE }));
    }
    // Sequential batches cap concurrent requests at BATCH_SIZE
    // eslint-disable-next-line no-await-in-loop -- intentional batching
    const batchResponses = await Promise.all(batchPromises);
    remainingResponses.push(...batchResponses);
  }

  const results = [
    ...denormalisedResponseEntities(initialResponse),
    ...remainingResponses.flatMap((response) => denormalisedResponseEntities(response)),
  ];

  return results;
};

export default queryAllPages;
