export default [
  {
    path: '/wishlist',
    name: 'WishlistPage',
    auth: true,
    authPage: 'LoginPage',
    loaders: {
      page: () => import('./containers/WishlistPage/WishlistPage'),
      duck: () => import('./containers/WishlistPage/WishlistPage.duck'),
    },
  },
];
