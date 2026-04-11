const transitions = {
  REQUEST_PAYMENT: 'transition/request-payment',
  REQUEST: 'transition/request',
  INQUIRE: 'transition/inquire',
  REQUEST_PAYMENT_AFTER_INQUIRY: 'transition/request-payment-after-inquiry',
  REQUEST_AFTER_INQUIRY: 'transition/request-after-inquiry',
  CONFIRM_PAYMENT: 'transition/confirm-payment',
  EXPIRE_PAYMENT: 'transition/expire-payment',
  ACCEPT: 'transition/accept',
  DECLINE: 'transition/decline',
  OPERATOR_ACCEPT: 'transition/operator-accept',
  OPERATOR_DECLINE: 'transition/operator-decline',
  ACCEPT_WITH_PAYMENT: 'transition/accept-with-payment',
  DECLINE_WITHOUT_PAYMENT: 'transition/decline-without-payment',
  OPERATOR_ACCEPT_WITH_PAYMENT: 'transition/operator-accept-with-payment',
  OPERATOR_DECLINE_WITHOUT_PAYMENT: 'transition/operator-decline-without-payment',
  EXPIRE: 'transition/expire',
  EXPIRE_NO_PAYMENT: 'transition/expire-no-payment',
  CANCEL: 'transition/cancel',
  COMPLETE: 'transition/complete',
  OPERATOR_COMPLETE: 'transition/operator-complete',
  REVIEW_1_BY_PROVIDER: 'transition/review-1-by-provider',
  REVIEW_2_BY_PROVIDER: 'transition/review-2-by-provider',
  REVIEW_1_BY_CUSTOMER: 'transition/review-1-by-customer',
  REVIEW_2_BY_CUSTOMER: 'transition/review-2-by-customer',
  EXPIRE_CUSTOMER_REVIEW_PERIOD: 'transition/expire-customer-review-period',
  EXPIRE_PROVIDER_REVIEW_PERIOD: 'transition/expire-provider-review-period',
  EXPIRE_REVIEW_PERIOD: 'transition/expire-review-period',
};

exports.transitions = transitions;

const states = {
  INITIAL: 'initial',
  INQUIRY: 'inquiry',
  PENDING_PAYMENT: 'pending-payment',
  PAYMENT_EXPIRED: 'payment-expired',
  REQUESTED: 'requested',
  PREAUTHORIZED: 'preauthorized',
  DECLINED: 'declined',
  ACCEPTED: 'accepted',
  EXPIRED: 'expired',
  CANCELED: 'canceled',
  DELIVERED: 'delivered',
  REVIEWED: 'reviewed',
  REVIEWED_BY_CUSTOMER: 'reviewed-by-customer',
  REVIEWED_BY_PROVIDER: 'reviewed-by-provider',
};

exports.states = states;

const graph = {
  id: 'default-booking/release-1',
  initial: states.INITIAL,
  states: {
    [states.INITIAL]: {
      on: {
        [transitions.INQUIRE]: states.INQUIRY,
        [transitions.REQUEST_PAYMENT]: states.PENDING_PAYMENT,
        [transitions.REQUEST]: states.REQUESTED,
      },
    },
    [states.INQUIRY]: {
      on: {
        [transitions.REQUEST_PAYMENT_AFTER_INQUIRY]: states.PENDING_PAYMENT,
        [transitions.REQUEST_AFTER_INQUIRY]: states.REQUESTED,
      },
    },
    [states.REQUESTED]: {
      on: {
        [transitions.ACCEPT_WITH_PAYMENT]: states.ACCEPTED,
        [transitions.DECLINE_WITHOUT_PAYMENT]: states.DECLINED,
        [transitions.OPERATOR_ACCEPT_WITH_PAYMENT]: states.ACCEPTED,
        [transitions.OPERATOR_DECLINE_WITHOUT_PAYMENT]: states.DECLINED,
        [transitions.EXPIRE_NO_PAYMENT]: states.EXPIRED,
      },
    },
    [states.PENDING_PAYMENT]: {
      on: {
        [transitions.EXPIRE_PAYMENT]: states.PAYMENT_EXPIRED,
        [transitions.CONFIRM_PAYMENT]: states.PREAUTHORIZED,
      },
    },

    [states.PAYMENT_EXPIRED]: {},
    [states.PREAUTHORIZED]: {
      on: {
        [transitions.DECLINE]: states.DECLINED,
        [transitions.OPERATOR_DECLINE]: states.DECLINED,
        [transitions.EXPIRE]: states.EXPIRED,
        [transitions.ACCEPT]: states.ACCEPTED,
        [transitions.OPERATOR_ACCEPT]: states.ACCEPTED,
      },
    },

    [states.DECLINED]: {},
    [states.EXPIRED]: {},
    [states.ACCEPTED]: {
      on: {
        [transitions.CANCEL]: states.CANCELED,
        [transitions.COMPLETE]: states.DELIVERED,
        [transitions.OPERATOR_COMPLETE]: states.DELIVERED,
      },
    },

    [states.CANCELED]: {},
    [states.DELIVERED]: {
      on: {
        [transitions.EXPIRE_REVIEW_PERIOD]: states.REVIEWED,
        [transitions.REVIEW_1_BY_CUSTOMER]: states.REVIEWED_BY_CUSTOMER,
        [transitions.REVIEW_1_BY_PROVIDER]: states.REVIEWED_BY_PROVIDER,
      },
    },

    [states.REVIEWED_BY_CUSTOMER]: {
      on: {
        [transitions.REVIEW_2_BY_PROVIDER]: states.REVIEWED,
        [transitions.EXPIRE_PROVIDER_REVIEW_PERIOD]: states.REVIEWED,
      },
    },
    [states.REVIEWED_BY_PROVIDER]: {
      on: {
        [transitions.REVIEW_2_BY_CUSTOMER]: states.REVIEWED,
        [transitions.EXPIRE_CUSTOMER_REVIEW_PERIOD]: states.REVIEWED,
      },
    },
    [states.REVIEWED]: { type: 'final' },
  },
};

exports.graph = graph;

exports.nonFinalTransitions = [
  transitions.REQUEST_PAYMENT,
  transitions.REQUEST_PAYMENT_AFTER_INQUIRY,
  transitions.REQUEST,
  transitions.REQUEST_AFTER_INQUIRY,
  transitions.CONFIRM_PAYMENT,
  transitions.ACCEPT,
  transitions.ACCEPT_WITH_PAYMENT,
  transitions.COMPLETE,
  transitions.OPERATOR_COMPLETE,
  transitions.REVIEW_1_BY_CUSTOMER,
  transitions.REVIEW_1_BY_PROVIDER,
];
