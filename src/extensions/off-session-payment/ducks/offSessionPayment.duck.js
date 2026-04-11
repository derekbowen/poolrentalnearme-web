// ================ Action types ================ //

import { createStripeSetupIntent } from 'containers/PaymentMethodsPage/PaymentMethodsPage.duck';
import { savePaymentMethod } from 'ducks/paymentMethods.duck';
import { handleCardSetup } from 'ducks/stripe.duck';
import { storableError } from '../../../util/errors';
import { getStripeConnected } from '../api';
import { getClientSecret, getPaymentParams } from '../utils/payment';

const FETCH_STRIPE_CONNECTED = 'app/user/FETCH_STRIPE_CONNECTED';
const FETCH_STRIPE_CONNECTED_SUCCESS = 'app/user/FETCH_STRIPE_CONNECTED_SUCCESS';
const FETCH_STRIPE_CONNECTED_ERROR = 'app/user/FETCH_STRIPE_CONNECTED_ERROR';

const CREATE_PAYMENT_METHOD_AND_SAVE = 'app/user/CREATE_PAYMENT_METHOD_AND_SAVE';
const CREATE_PAYMENT_METHOD_AND_SAVE_ERROR = 'app/user/CREATE_PAYMENT_METHOD_AND_SAVE_ERROR';

// ================ Reducer ================ //

const initialState = {
  userId: null,
  stripeConnected: false,
  fetchStripeConnectedError: null,
  createPaymentMethodAndSaveError: null,
};

export default function reducer(state = initialState, action = {}) {
  const { type, payload } = action;
  switch (type) {
    case FETCH_STRIPE_CONNECTED:
      return {
        ...state,
        userId: payload,
        stripeConnected: false,
      };
    case FETCH_STRIPE_CONNECTED_SUCCESS:
      return {
        ...state,
        stripeConnected: payload,
      };
    case FETCH_STRIPE_CONNECTED_ERROR:
      return {
        ...state,
        fetchStripeConnectedError: false,
      };
    case CREATE_PAYMENT_METHOD_AND_SAVE:
      return {
        ...state,
        createPaymentMethodAndSaveError: null,
      };
    case CREATE_PAYMENT_METHOD_AND_SAVE_ERROR:
      return {
        ...state,
        createPaymentMethodAndSaveError: payload,
      };
    default:
      return state;
  }
}

// ================ Action creators ================ //

const fetchStripeConnectedRequest = (userId) => ({ type: FETCH_STRIPE_CONNECTED, payload: userId });
const fetchStripeConnectedSuccess = (stripeConnected) => ({
  type: FETCH_STRIPE_CONNECTED_SUCCESS,
  payload: stripeConnected,
});
const fetchStripeConnectedError = (error) => ({
  type: FETCH_STRIPE_CONNECTED_ERROR,
  error: true,
  payload: error,
});

const createPaymentMethodAndSaveRequest = () => ({ type: CREATE_PAYMENT_METHOD_AND_SAVE });
const createPaymentMethodAndSaveError = (error) => ({
  type: CREATE_PAYMENT_METHOD_AND_SAVE_ERROR,
  error: true,
  payload: error,
});

// ================ Thunks ================ //

export const fetchStripeConnected = (userId) => async (dispatch) => {
  dispatch(fetchStripeConnectedRequest(userId));
  try {
    if (!userId) {
      throw new Error('userId is missing');
    }
    const response = await getStripeConnected(userId);
    const {
      data: { stripeConnected },
    } = response;
    dispatch(fetchStripeConnectedSuccess(stripeConnected));
    return stripeConnected;
  } catch (e) {
    dispatch(fetchStripeConnectedError(storableError(e)));
    return false;
  }
};

export const createPaymentMethodAndSave =
  ({ stripe, card, billingDetails, stripeCustomer }) =>
  async (dispatch) => {
    dispatch(createPaymentMethodAndSaveRequest());
    try {
      const setupIntent = await dispatch(createStripeSetupIntent());

      const stripeParams = {
        stripe,
        card,
        setupIntentClientSecret: getClientSecret(setupIntent),
        paymentParams: getPaymentParams({ billingDetails }),
      };
      const cardSetup = await dispatch(handleCardSetup(stripeParams));
      const paymentMethod = cardSetup.setupIntent.payment_method;
      return dispatch(savePaymentMethod(stripeCustomer, paymentMethod));
    } catch (e) {
      return dispatch(createPaymentMethodAndSaveError(storableError(e)));
    }
  };

export const selectStripeConnected = (state) => state.offSessionPayment.stripeConnected;
