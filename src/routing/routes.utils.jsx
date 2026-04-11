/* eslint-disable import/prefer-default-export */
import RouteErrorElement from './RouteErrorElement/RouteErrorElement';
import RouteFallback from './RouteFallback/RouteFallback';
import WithAuthCheck from './WithAuthCheck';

const loaderMaybe = (loadData, config, store, extraProps) => {
  if (loadData) {
    const loader = async ({ request, params }) => {
      await store.dispatch(
        loadData({ ...params, ...extraProps }, new URL(request.url).search, config)
      );
      return null;
    };
    loader.hydrate = true;

    return loader;
  }
  return undefined;
};

export const createRouteConfig = ({
  auth = false,
  authPage = 'SignupPage',
  config,
  duckName,
  extraProps = {},
  loaders,
  name,
  path,
  store,
  element,
  Component,
  ...rest
}) => {
  if (element || Component) {
    return {
      ...rest,
      name,
      path,
      element,
      Component,
      errorElement: <RouteErrorElement authPage={authPage} />,
    };
  }

  if (loaders?.page) {
    const { page: pageLoader, duck: duckLoader } = loaders;
    return {
      ...rest,
      name,
      path,
      errorElement: <RouteErrorElement authPage={authPage} />,
      HydrateFallback: RouteFallback,
      lazy: async () => {
        const [{ default: importedComponent }, importedDuck = {}] = await Promise.all([
          pageLoader(),
          duckLoader?.(),
        ]);

        const { loadData } = importedDuck;

        const loader = loaderMaybe(loadData, config, store, extraProps);
        return {
          element: (
            <WithAuthCheck
              component={importedComponent}
              auth={auth}
              authPage={authPage}
              extraProps={extraProps}
            />
          ),
          loader,
        };
      },
    };
  }

  throw new Error('No loaders provided');
};
