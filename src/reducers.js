import isEqual from 'lodash/isEqual';
import uniq from 'lodash/uniq';
import * as pageReducers from './containers/reducers';
import * as globalReducers from './ducks';
import { USER_LOGOUT } from './ducks/auth.duck';
import { getAllExtensionReducers } from './extension';

const extensionReducers = await getAllExtensionReducers();

const combineReducers = (reducers) => {
  const reducerKeys = Object.keys(reducers);

  return function combination(state, action) {
    const nextState = {
      ...state,
    };
    const keys = uniq(Object.keys(state).concat(reducerKeys));
    const numberOfKeys = keys.length;
    for (let i = 0; i < numberOfKeys; i++) {
      const key = reducerKeys[i];
      const reducer = reducers[key];
      // If the reducer already exists, we call it with the current state and the action then we update the state with the new value
      if (typeof reducer === 'function') {
        const previousStateForKey = state[key];
        const nextStateForKey = reducer(previousStateForKey, action);
        nextState[key] = nextStateForKey;
      }
    }
    // To avoid unnecessary updates, we return the previous state if the next state is equal to the current state
    if (isEqual(nextState, state)) {
      return state;
    }
    return nextState;
  };
};
const reducers = { ...globalReducers, ...pageReducers, ...extensionReducers };

const combinedReducer = combineReducers(reducers);

const appReducer = (state, action) => {
  const appState = action.type === USER_LOGOUT ? undefined : state;

  if (action.type === USER_LOGOUT && typeof window !== 'undefined' && !!window.sessionStorage) {
    window.sessionStorage.clear();
  }

  return combinedReducer(appState, action);
};

export default appReducer;
