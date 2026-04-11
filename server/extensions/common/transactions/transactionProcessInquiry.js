const transitions = {
  INQUIRE_WITHOUT_PAYMENT: 'transition/inquire-without-payment',
};

exports.transitions = transitions;

const states = {
  INITIAL: 'initial',
  FREE_INQUIRY: 'free-inquiry',
};

exports.states = states;

exports.graph = {
  id: 'default-inquiry/release-1',
  initial: states.INITIAL,
  states: {
    [states.INITIAL]: {
      on: {
        [transitions.INQUIRE_WITHOUT_PAYMENT]: states.FREE_INQUIRY,
      },
    },
    [states.FREE_INQUIRY]: { type: 'final' },
  },
};

exports.nonFinalTransitions = [];
