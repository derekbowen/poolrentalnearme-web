const transitions = {
  REQUEST_PAYMENT: 'transition/request-payment',
  INQUIRE: 'transition/inquire',
  REQUEST_PAYMENT_AFTER_INQUIRY: 'transition/request-payment-after-inquiry',
  CONFIRM_PAYMENT: 'transition/confirm-payment',
  EXPIRE_PAYMENT: 'transition/expire-payment',
  MARK_DELIVERED: 'transition/mark-delivered',
  OPERATOR_MARK_DELIVERED: 'transition/operator-mark-delivered',
  MARK_RECEIVED_FROM_PURCHASED: 'transition/mark-received-from-purchased',
  AUTO_CANCEL: 'transition/auto-cancel',
  CANCEL: 'transition/cancel',
  MARK_RECEIVED: 'transition/mark-received',
  AUTO_MARK_RECEIVED: 'transition/auto-mark-received',
  DISPUTE: 'transition/dispute',
  OPERATOR_DISPUTE: 'transition/operator-dispute',
  AUTO_CANCEL_FROM_DISPUTED: 'transition/auto-cancel-from-disputed',
  CANCEL_FROM_DISPUTED: 'transition/cancel-from-disputed',
  MARK_RECEIVED_FROM_DISPUTED: 'transition/mark-received-from-disputed',
  AUTO_COMPLETE: 'transition/auto-complete',
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
  PURCHASED: 'purchased',
  DELIVERED: 'delivered',
  RECEIVED: 'received',
  DISPUTED: 'disputed',
  CANCELED: 'canceled',
  COMPLETED: 'completed',
  REVIEWED: 'reviewed',
  REVIEWED_BY_CUSTOMER: 'reviewed-by-customer',
  REVIEWED_BY_PROVIDER: 'reviewed-by-provider',
};

exports.states = states;

exports.graph = {
  id: 'default-purchase/release-1',
  initial: states.INITIAL,
  states: {
    [states.INITIAL]: {
      on: {
        [transitions.INQUIRE]: states.INQUIRY,
        [transitions.REQUEST_PAYMENT]: states.PENDING_PAYMENT,
      },
    },
    [states.INQUIRY]: {
      on: {
        [transitions.REQUEST_PAYMENT_AFTER_INQUIRY]: states.PENDING_PAYMENT,
      },
    },

    [states.PENDING_PAYMENT]: {
      on: {
        [transitions.EXPIRE_PAYMENT]: states.PAYMENT_EXPIRED,
        [transitions.CONFIRM_PAYMENT]: states.PURCHASED,
      },
    },

    [states.PAYMENT_EXPIRED]: {},
    [states.PURCHASED]: {
      on: {
        [transitions.MARK_DELIVERED]: states.DELIVERED,
        [transitions.OPERATOR_MARK_DELIVERED]: states.DELIVERED,
        [transitions.MARK_RECEIVED_FROM_PURCHASED]: states.RECEIVED,
        [transitions.AUTO_CANCEL]: states.CANCELED,
        [transitions.CANCEL]: states.CANCELED,
      },
    },

    [states.CANCELED]: {},

    [states.DELIVERED]: {
      on: {
        [transitions.MARK_RECEIVED]: states.RECEIVED,
        [transitions.AUTO_MARK_RECEIVED]: states.RECEIVED,
        [transitions.DISPUTE]: states.DISPUTED,
        [transitions.OPERATOR_DISPUTE]: states.DISPUTED,
      },
    },

    [states.DISPUTED]: {
      on: {
        [transitions.AUTO_CANCEL_FROM_DISPUTED]: states.CANCELED,
        [transitions.CANCEL_FROM_DISPUTED]: states.CANCELED,
        [transitions.MARK_RECEIVED_FROM_DISPUTED]: states.RECEIVED,
      },
    },

    [states.RECEIVED]: {
      on: {
        [transitions.AUTO_COMPLETE]: states.COMPLETED,
      },
    },

    [states.COMPLETED]: {
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

exports.nonFinalTransitions = [
  transitions.REQUEST_PAYMENT,
  transitions.REQUEST_PAYMENT_AFTER_INQUIRY,
  transitions.CONFIRM_PAYMENT,
  transitions.MARK_DELIVERED,
  transitions.OPERATOR_MARK_DELIVERED,
  transitions.MARK_RECEIVED_FROM_PURCHASED,
  transitions.MARK_RECEIVED,
  transitions.AUTO_MARK_RECEIVED,
  transitions.DISPUTE,
  transitions.MARK_RECEIVED_FROM_DISPUTED,
  transitions.AUTO_COMPLETE,
  transitions.REVIEW_1_BY_CUSTOMER,
  transitions.REVIEW_1_BY_PROVIDER,
];
