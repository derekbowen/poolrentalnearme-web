import React from 'react';
import { FormattedMessage } from 'react-intl';
import { enableUserNavItem } from './config/configWishlist';

/**
 * @description `My wishlist` tab for the user navigation bar
 * @constant {Array} wishlistTab
 * @copyright Journey Horizon Vietnam
 * @example 
 * {
    text: string,
    selected: boolean,
    disabled: boolean,
    linkProps: {
      name: string,
    },
  },
 */
export const wishlistUserNavTab = ({ currentPage }) => [
  {
    text: <FormattedMessage id="UserNav.myWishlistLink" />,
    selected: currentPage === 'WishlistPage',
    disabled: !enableUserNavItem,
    linkProps: {
      name: 'WishlistPage',
    },
  },
];
