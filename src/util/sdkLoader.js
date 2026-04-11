import * as exportSdk from 'sharetribe-flex-sdk';

const { createInstance, types, transit, util } = exportSdk;

const isServer = () => typeof window === 'undefined';

// create image variant from variant name, desired width and aspectRatio
const createImageVariantConfig = (name, width, aspectRatio) => {
  let variantWidth = width;
  let variantHeight = Math.round(aspectRatio * width);

  if (variantWidth > 3072 || variantHeight > 3072) {
    if (!isServer) {
      console.error(`Dimensions of custom image variant (${name}) are too high (w:${variantWidth}, h:${variantHeight}).
      Reduce them to max 3072px. https://www.sharetribe.com/api-reference/marketplace.html#custom-image-variants`);
    }

    if (variantHeight > 3072) {
      variantHeight = 3072;
      variantWidth = Math.round(variantHeight / aspectRatio);
    } else if (variantHeight > 3072) {
      variantWidth = 3072;
      variantHeight = Math.round(aspectRatio * variantWidth);
    }
  }

  return {
    [`imageVariant.${name}`]: util.objectQueryString({
      w: variantWidth,
      h: variantHeight,
      fit: 'crop',
    }),
  };
};

export { createInstance, types, transit, util, createImageVariantConfig };
