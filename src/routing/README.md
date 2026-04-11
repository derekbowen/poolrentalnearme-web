# Routing

The routing of the template is created on top of React Router v6 (6.25.1).

There's a routeConfiguration and AppRouter component, which creates routes based on the configuration.

`Note: routeConfiguration is saved to React Context to be referenced by child components.`

## routeConfiguration.jsx

This file contains the configuration for the routes. It's an array of objects, where each object
contains the following properties:
- name (string): The name of the route. This is used to create a unique key for the route.
- path (string): The path of the route. This is used to match the route with the current URL. More info about path matching can be found from the [React Router documentation](https://reactrouter.com/en/6.25.1/route/route#path).
- element/Component: The React Element or Component to render when the route matches the URL.
- loaders (object): An object containing the loaders for the route. The loaders object can contain the following properties:
  - duck (function): A function that returns a promise that resolves to the reducer. The reducer will be injected into the Redux store when the route is loaded.
  - page (function): A function that returns a promise that resolves to the page component. The page component will be rendered when the route is loaded.

## routes.utils.jsx

This file contains utility functions for routes. It has functions for creating routes.

- `createRouteConfig`: Creates routes based on the configuration. It support lazy loading of the component/element and dynamic inject reducer to the Redux store. For confi object, please check `CreateRouteParams` type in the file.

## AppRouter.jsx

This file contains the AppRouter component, which creates routes based on the configuration. It uses the `routeConfiguration` to create routes.

There is a component `RootRoute` that is used to create the root route. It is used to run the `code` or `component` on global level (outside of the route).

## RouteFallback.jsx

This file contains the RouteFallback component, which is used to display the fallback component while the route is loading/hydrate-ing.

## RouteErrorlement.jsx

This file contains the RouteErrorElement component, which is used to display the error component when the route fails to load or there is an error in the route loader.
