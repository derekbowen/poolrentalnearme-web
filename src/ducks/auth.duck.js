import * as log from '../util/log';
import { storableError } from '../util/errors';
import { clearCurrentUser, fetchCurrentUser } from './user.duck';
import { createUserWithIdp } from '../util/api';
import { apiSendOTP, apiVerifyOTP } from '../extensions/phone-number-verification/api';
import { getSuperLoginAsUser } from '../util/cookie';
import signInIntercom from '../extensions/intercom/mod/intercom/signIn';
import signOutIntercom from '../extensions/intercom/mod/intercom/signOut';

const authenticated = authInfo => authInfo?.isAnonymous === false;
const loggedInAs = authInfo => authInfo?.isLoggedInAs === true;

// ================ Action types ================ //

export const AUTH_INFO_REQUEST = 'app/auth/AUTH_INFO_REQUEST';
export const AUTH_INFO_SUCCESS = 'app/auth/AUTH_INFO_SUCCESS';

export const LOGIN_REQUEST = 'app/auth/LOGIN_REQUEST';
export const LOGIN_SUCCESS = 'app/auth/LOGIN_SUCCESS';
export const LOGIN_ERROR = 'app/auth/LOGIN_ERROR';

export const LOGOUT_REQUEST = 'app/auth/LOGOUT_REQUEST';
export const LOGOUT_SUCCESS = 'app/auth/LOGOUT_SUCCESS';
export const LOGOUT_ERROR = 'app/auth/LOGOUT_ERROR';

export const SIGNUP_REQUEST = 'app/auth/SIGNUP_REQUEST';
export const SIGNUP_SUCCESS = 'app/auth/SIGNUP_SUCCESS';
export const SIGNUP_ERROR = 'app/auth/SIGNUP_ERROR';

export const CONFIRM_REQUEST = 'app/auth/CONFIRM_REQUEST';
export const CONFIRM_SUCCESS = 'app/auth/CONFIRM_SUCCESS';
export const CONFIRM_ERROR = 'app/auth/CONFIRM_ERROR';

// Generic user_logout action that can be handled elsewhere
// E.g. src/reducers.js clears store as a consequence
export const USER_LOGOUT = 'app/USER_LOGOUT';

export const SEND_OTP_REQUEST = 'app/auth/SEND_OTP_REQUEST';
export const SEND_OTP_SUCCESS = 'app/auth/SEND_OTP_SUCCESS';
export const SEND_OTP_ERROR = 'app/auth/SEND_OTP_ERROR';

export const VERIFY_OTP_REQUEST = 'app/auth/VERIFY_OTP_REQUEST';
export const VERIFY_OTP_SUCCESS = 'app/auth/VERIFY_OTP_SUCCESS';
export const VERIFY_OTP_ERROR = 'app/auth/VERIFY_OTP_ERROR';

// ================ Reducer ================ //

const initialState = {
  isAuthenticated: false,

  // is marketplace operator logged in as a marketplace user
  isLoggedInAs: false,

  // scopes associated with current token
  authScopes: [],

  // auth info
  authInfoLoaded: false,

  // login
  loginError: null,
  loginInProgress: false,

  // logout
  logoutError: null,
  logoutInProgress: false,

  // signup
  signupError: null,
  signupInProgress: false,

  // confirm (create use with idp)
  confirmError: null,
  confirmInProgress: false,

  sendOTPError: null,
  sendOTPInProgress: false,

  verifyOTPError: null,
  verifyOTPInProgress: false,
};

export default function reducer(state = initialState, action = {}) {
  const { type, payload } = action;
  switch (type) {
    case AUTH_INFO_REQUEST:
      return state;
    case AUTH_INFO_SUCCESS:
      return {
        ...state,
        authInfoLoaded: true,
        isAuthenticated: authenticated(payload),
        isLoggedInAs: loggedInAs(payload),
        authScopes: payload.scopes,
      };

    case LOGIN_REQUEST:
      return {
        ...state,
        loginInProgress: true,
        loginError: null,
        logoutError: null,
        signupError: null,
      };
    case LOGIN_SUCCESS:
      return { ...state, loginInProgress: false, isAuthenticated: true };
    case LOGIN_ERROR:
      return { ...state, loginInProgress: false, loginError: payload };

    case LOGOUT_REQUEST:
      return { ...state, logoutInProgress: true, loginError: null, logoutError: null };
    case LOGOUT_SUCCESS:
      return {
        ...state,
        logoutInProgress: false,
        isAuthenticated: false,
        isLoggedInAs: false,
        authScopes: [],
      };
    case LOGOUT_ERROR:
      return { ...state, logoutInProgress: false, logoutError: payload };

    case SIGNUP_REQUEST:
      return { ...state, signupInProgress: true, loginError: null, signupError: null };
    case SIGNUP_SUCCESS:
      return { ...state, signupInProgress: false };
    case SIGNUP_ERROR:
      return { ...state, signupInProgress: false, signupError: payload };

    case CONFIRM_REQUEST:
      return { ...state, confirmInProgress: true, loginError: null, confirmError: null };
    case CONFIRM_SUCCESS:
      return { ...state, confirmInProgress: false, isAuthenticated: true };
    case CONFIRM_ERROR:
      return { ...state, confirmInProgress: false, confirmError: payload };

    case SEND_OTP_REQUEST:
      return { ...state, sendOTPInProgress: true, sendOTPError: null };
    case SEND_OTP_SUCCESS:
      return { ...state, sendOTPInProgress: false };
    case SEND_OTP_ERROR:
      return { ...state, sendOTPInProgress: false, sendOTPError: payload };

    case VERIFY_OTP_REQUEST:
      return { ...state, verifyOTPInProgress: true, verifyOTPError: null };
    case VERIFY_OTP_SUCCESS:
      return { ...state, verifyOTPInProgress: false };
    case VERIFY_OTP_ERROR:
      return { ...state, verifyOTPInProgress: false, verifyOTPError: payload };

    default:
      return state;
  }
}

// ================ Selectors ================ //

export const authenticationInProgress = (state) => {
  const { loginInProgress, logoutInProgress, signupInProgress, confirmInProgress } = state.auth;
  return loginInProgress || logoutInProgress || signupInProgress || confirmInProgress;
};

// ================ Action creators ================ //

export const authInfoRequest = () => ({ type: AUTH_INFO_REQUEST });
export const authInfoSuccess = info => ({ type: AUTH_INFO_SUCCESS, payload: info });

export const loginRequest = () => ({ type: LOGIN_REQUEST });
export const loginSuccess = () => ({ type: LOGIN_SUCCESS });
export const loginError = error => ({ type: LOGIN_ERROR, payload: error, error: true });

export const logoutRequest = () => ({ type: LOGOUT_REQUEST });
export const logoutSuccess = () => ({ type: LOGOUT_SUCCESS });
export const logoutError = error => ({ type: LOGOUT_ERROR, payload: error, error: true });

export const signupRequest = () => ({ type: SIGNUP_REQUEST });
export const signupSuccess = () => ({ type: SIGNUP_SUCCESS });
export const signupError = error => ({ type: SIGNUP_ERROR, payload: error, error: true });

export const confirmRequest = () => ({ type: CONFIRM_REQUEST });
export const confirmSuccess = () => ({ type: CONFIRM_SUCCESS });
export const confirmError = error => ({ type: CONFIRM_ERROR, payload: error, error: true });

export const userLogout = () => ({ type: USER_LOGOUT });

export const sendOTPRequest = () => ({ type: SEND_OTP_REQUEST });
export const sendOTPSuccess = () => ({ type: SEND_OTP_SUCCESS });
export const sendOTPError = (error) => ({ type: SEND_OTP_ERROR, payload: error, error: true });

export const verifyOTPRequest = () => ({ type: VERIFY_OTP_REQUEST });
export const verifyOTPSuccess = () => ({ type: VERIFY_OTP_SUCCESS });
export const verifyOTPError = (error) => ({ type: VERIFY_OTP_ERROR, payload: error, error: true });

// ================ Thunks ================ //

export const authInfo = () => async (dispatch, getState, sdk) => {
  dispatch(authInfoRequest());
  try {
    const info = await sdk.authInfo();
    const { currentUser } = getState().user;
    if (currentUser) {
      signInIntercom(currentUser);
    } else {
      signOutIntercom();
    }
    return dispatch(authInfoSuccess(info));
  } catch (e) {
    log.error(e, 'auth-info-failed');
    dispatch(authInfoSuccess(null));
  }
};

export const login = (username, password) => (dispatch, getState, sdk) => {
  if (authenticationInProgress(getState())) {
    return Promise.reject(new Error('Login or logout already in progress'));
  }
  dispatch(loginRequest());

  // Note that the thunk does not reject when the login fails, it
  // just dispatches the login error action.
  return sdk
    .login({ username, password })
    .then(() => dispatch(fetchCurrentUser({ afterLogin: true })))
    .then(() => dispatch(loginSuccess()))
    .catch(e => dispatch(loginError(storableError(e))));
};

export const logout = () => async (dispatch, getState, sdk) => {
  if (authenticationInProgress(getState())) {
    return Promise.reject(new Error('Login or logout already in progress'));
  }
  dispatch(logoutRequest());

  if (getSuperLoginAsUser()) {
    document.cookie =
      'st-super-login-as-impersonating=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    dispatch(logoutSuccess());
    return window.location.reload();
  }

  try {
    await sdk.logout();
    dispatch(clearCurrentUser());
    log.clearUserId();
    return dispatch(userLogout());
  } catch (e) {
    return dispatch(logoutError(storableError(e)));
  }
};

export const signup = params => (dispatch, getState, sdk) => {
  if (authenticationInProgress(getState())) {
    return Promise.reject(new Error('Login or logout already in progress'));
  }
  dispatch(signupRequest());
  // Note: params are already structured on AuthenticationPage (handleSubmitSignup)

  // We must login the user if signup succeeds since the API doesn't
  // do that automatically.
  return sdk.currentUser
    .create(params)
    .then(() => dispatch(signupSuccess()))
    .then(() => dispatch(login(params.email, params.password)))
    .catch(e => {
      dispatch(signupError(storableError(e)));
      log.error(e, 'signup-failed', {
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
      });
    });
};

export const signupWithIdp = params => (dispatch, getState, sdk) => {
  dispatch(confirmRequest());
  return createUserWithIdp(params)
    .then(res => {
      return dispatch(confirmSuccess());
    })
    .then(() => dispatch(fetchCurrentUser()))
    .catch(e => {
      log.error(e, 'create-user-with-idp-failed', { params });
      return dispatch(confirmError(storableError(e)));
    });
};

export const sendOTP = (params) => async (dispatch) => {
  try {
    dispatch(sendOTPRequest());
    await apiSendOTP(params);
    dispatch(sendOTPSuccess());
  } catch (e) {
    dispatch(sendOTPError(storableError(e)));
  }
};

export const verifyOTP = (params) => async (dispatch) => {
  try {
    dispatch(verifyOTPRequest());
    await apiVerifyOTP(params);
    dispatch(verifyOTPSuccess());
  } catch (e) {
    dispatch(verifyOTPError(storableError(e)));
    throw e;
  }
};
