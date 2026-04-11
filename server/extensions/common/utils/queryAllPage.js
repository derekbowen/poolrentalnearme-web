import { denormalisedResponseEntities } from 'api-util/data';
import { parallelLimit } from 'async';

const queryAllPage = async ({ sdkModel, params = {} }) => {
  let entities = [];
  const query = async (page = 1) => {
    const response = await sdkModel.query({
      ...params,
      page,
    });
    entities = entities.concat(denormalisedResponseEntities(response));
    return response;
  };
  const firstResponse = await query();

  const { meta } = firstResponse.data;
  const remainingPages = Array.from({
    length: meta.totalPages - 1,
  }).map((_, index) => index + 2);

  if (remainingPages.length > 0) {
    await parallelLimit(
      remainingPages.map((page) => async () => {
        await query(page);
      }),
      4
    );
  }

  return entities;
};

export default queryAllPage;
