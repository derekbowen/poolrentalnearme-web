const combineObjectRelationships = (oldRels, newRels) => {
  if (!oldRels && !newRels) {
    return null;
  }
  return { ...oldRels, ...newRels };
};

const combineObject = (oldObject, newObject) => {
  if (!oldObject) {
    return newObject;
  }

  if (!newObject || oldObject.id.uuid !== newObject.id.uuid || oldObject.type !== newObject.type) {
    throw new Error('Cannot combine objects with different id or type.');
  }
  const { id, type } = oldObject;
  const attributesOld = oldObject.attributes || {};
  const attributesNew = newObject.attributes || {};
  const attributes = { ...attributesOld, ...attributesNew };

  const relationships = combineObjectRelationships(
    oldObject.relationships,
    newObject.relationships
  );

  return { id, type, attributes, ...relationships };
};

const getResponseEntities = (apiResponse) => {
  const { data, included = [] } = apiResponse;
  const objects = (Array.isArray(data) ? data : [data]).concat(included);

  return objects.reduce((entities, curr) => {
    const { id, type } = curr;
    if (entities[type]) {
      return {
        ...entities,
        [type]: {
          ...entities[type],
          [id.uuid]: combineObject(entities[type][id.uuid], curr),
        },
      };
    }
    return {
      ...entities,
      [type]: {
        [id.uuid]: curr,
      },
    };
  }, {});
};

/**
 *
 * @param {Object} entities
 * @param {Array} resources
 * @returns {Array}
 */
const denormalisedEntities = (entities, resources) => {
  const denormalised = resources.map((resource) => {
    const { type, id } = resource;
    const entity = entities[type] && id && entities[type][id.uuid];
    if (!entity) {
      return null;
    }

    const { relationships, ...restEntity } = entity;
    let relationshipsData = {};
    if (relationships) {
      relationshipsData = Object.entries(relationships).reduce((acc, [key, value]) => {
        const hasMultipleRefs = Array.isArray(value.data);
        const multipleRefsEmpty = hasMultipleRefs && value.data.length === 0;
        if (!value.data || multipleRefsEmpty) {
          return {
            ...acc,
            [key]: hasMultipleRefs ? [] : null,
          };
        }
        const refs = hasMultipleRefs ? value.data : [value.data];
        const rels = denormalisedEntities(entities, refs);

        return {
          ...acc,
          [key]: hasMultipleRefs ? rels : rels[0],
        };
      }, relationshipsData);
    }

    return {
      ...restEntity,
      ...relationshipsData,
    };
  });

  return denormalised.filter((entity) => !!entity);
};

/**
 *
 * @param {Object} sdkResponse response object from an SDK call
 */
exports.denormalisedResponseEntities = (sdkResponse) => {
  const apiResponse = sdkResponse.data;
  const { data } = apiResponse;
  const isArrayResponse = Array.isArray(data);
  const resources = isArrayResponse ? data : [data];

  if (!data || resources.length === 0) {
    return [];
  }

  const entities = getResponseEntities(apiResponse);
  const denormalisedData = denormalisedEntities(entities, resources);
  return isArrayResponse ? denormalisedData : denormalisedData[0];
};
