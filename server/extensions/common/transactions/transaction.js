const purchaseProcess = require('./transactionProcessPurchase');
const bookingProcess = require('./transactionProcessBooking');
const inquiryProcess = require('./transactionProcessInquiry');
const { loadExtensionsTransactionProcesses } = require('../utils/extensionLoader');

const ITEM = 'item';
const DAY = 'day';
const NIGHT = 'night';
const HOUR = 'hour';
const INQUIRY = 'inquiry';

exports.ITEM = ITEM;
exports.DAY = DAY;
exports.NIGHT = NIGHT;
exports.HOUR = HOUR;
exports.INQUIRY = INQUIRY;

// Then names of supported processes
const PURCHASE_PROCESS_NAME = 'default-purchase';
const BOOKING_PROCESS_NAME = 'default-booking';
const INQUIRY_PROCESS_NAME = 'default-inquiry';

exports.PURCHASE_PROCESS_NAME = PURCHASE_PROCESS_NAME;
exports.BOOKING_PROCESS_NAME = BOOKING_PROCESS_NAME;
exports.INQUIRY_PROCESS_NAME = INQUIRY_PROCESS_NAME;

const PROCESSES = [
  {
    name: PURCHASE_PROCESS_NAME,
    alias: `${PURCHASE_PROCESS_NAME}/release-1`,
    process: purchaseProcess,
    unitTypes: [ITEM],
  },
  {
    name: BOOKING_PROCESS_NAME,
    alias: `${BOOKING_PROCESS_NAME}/release-1`,
    process: bookingProcess,
    unitTypes: [DAY, NIGHT, HOUR],
  },
  {
    name: INQUIRY_PROCESS_NAME,
    alias: `${INQUIRY_PROCESS_NAME}/release-1`,
    process: inquiryProcess,
    unitTypes: [INQUIRY],
  },
].concat(loadExtensionsTransactionProcesses());

/**
 * Helper functions to figure out if transaction is in a specific state.
 * State is based on lastTransition given by transaction object and state description.
 *
 * @param {Object} tx transaction entity
 */
const txLastTransition = (tx) => tx?.attributes?.lastTransition;

/**
 * Get states from the graph.
 *
 * Note: currently we assume that state description is in stateX format
 *       and it doesn't contain nested states.
 *
 * @param {Object} graph Description of transaction process graph in StateX format
 */
const statesObjectFromGraph = (graph) => graph.states || {};

/**
 * This is a helper function that's attached to exported 'getProcess'.
 * Get next process state after given transition.
 *
 * @param {Object} process imported from a separate file
 * @returns {function} Returns a function to check the next state after given transition.
 */
const getStateAfterTransition = (process) => (transition) => {
  const statesObj = statesObjectFromGraph(process.graph);
  const stateNames = Object.keys(statesObj);
  const fromState = stateNames.find((stateName) => {
    const transitionsForward = Object.keys(statesObj[stateName]?.on || {});
    return transitionsForward.includes(transition);
  });

  return fromState && transition && statesObj[fromState]?.on[transition]
    ? statesObj[fromState]?.on[transition]
    : null;
};

/**
 * This is a helper function that's attached to exported 'getProcess' as 'getState'
 * Get state based on lastTransition of given transaction entity.
 *
 * How to use this function:
 *   // import { getProcess } from '../../transactions/transaction';
 *   const process = getProcess(processName);
 *   const state = process.getState(tx);
 *   const isInquiry = state === process.states.INQUIRY
 *
 * @param {Object} process imported from a separate file
 * @returns {function} Returns a function to check the current state of transaction entity against
 * given process.
 */
const getProcessState = (process) => (tx) => {
  return getStateAfterTransition(process)(txLastTransition(tx));
};

/**
 * Pick transition names that lead to target state from given entries.
 *
 * First parameter, "transitionEntries", should look like this:
 * [
 *   [transitionForward1, stateY],
 *   [transitionForward2, stateY],
 *   [transitionForward3, stateZ],
 * ]
 *
 * @param {Array} transitionEntries
 * @param {String} targetState
 * @param {Array} initialTransitions
 */
const pickTransitionsToTargetState = (transitionEntries, targetState, initialTransitions) => {
  return transitionEntries.reduce((pickedTransitions, transitionEntry) => {
    const [transition, nextState] = transitionEntry;
    return nextState === targetState ? [...pickedTransitions, transition] : pickedTransitions;
  }, initialTransitions);
};

/**
 * Get all the transitions that lead to specified state.
 *
 * Process uses following syntax to describe the graph:
 * states: {
 *   stateX: {
 *     on: {
 *       transitionForward1: stateY,
 *       transitionForward2: stateY,
 *       transitionForward3: stateZ,
 *     },
 *   },
 *   stateY: {},
 *   stateZ: {
 *     on: {
 *       transitionForward4: stateY,
 *     },
 *   },
 * },
 *
 * Finding all the transitions to 'stateY' should pick transitions: 1, 2, 4
 *
 * @param {Object} process
 * @param {String} targetState
 */
const getTransitionsToState = (process, targetState) => {
  const states = Object.values(statesObjectFromGraph(process.graph));

  return states.reduce((collectedTransitions, inspectedState) => {
    const transitionEntriesForward = Object.entries(inspectedState.on || {});
    return pickTransitionsToTargetState(
      transitionEntriesForward,
      targetState,
      collectedTransitions
    );
  }, []);
};

/**
 * Transitions that lead to given states.
 *
 * @param {Object} process against which transitions and states are checked.
 * @returns {function} Returns a function to get the transitions that lead to given states.
 */
const getTransitionsToStates = (process) => (stateNames) => {
  return stateNames.reduce((pickedTransitions, stateName) => {
    return [...pickedTransitions, ...getTransitionsToState(process, stateName)];
  }, []);
};

const txTransitions = (tx) => tx?.attributes?.transitions || [];

const hasPassedTransition = (transitionName, tx) =>
  !!txTransitions(tx).find((t) => t.transition === transitionName);

/**
 * Helper functions to figure out if transaction has passed a given state.
 * This is based on transitions history given by transaction object.
 *
 * @param {Object} process against which passed states are checked.
 */
const hasPassedState = (process) => (stateName, tx) => {
  return (
    getTransitionsToState(process, stateName).filter((t) => hasPassedTransition(t, tx)).length > 0
  );
};

/**
 * If process has been renamed, but the graph itself is the same,
 * this function allows referencing the updated name of the process.
 * ProcessName is used in some translation keys and stateData functions.
 *
 * Note: If the process graph has changed, you must create a separate process graph for it.
 *
 * @param {String} processName
 */
const resolveLatestProcessName = (processName) => {
  switch (processName) {
    case 'flex-product-default-process':
    case 'default-buying-products':
    case PURCHASE_PROCESS_NAME:
      return PURCHASE_PROCESS_NAME;
    case 'flex-default-process':
    case 'flex-hourly-default-process':
    case 'flex-booking-default-process':
    case BOOKING_PROCESS_NAME:
      return BOOKING_PROCESS_NAME;
    case INQUIRY_PROCESS_NAME:
      return INQUIRY_PROCESS_NAME;
    default:
      return processName;
  }
};

exports.resolveLatestProcessName = resolveLatestProcessName;

/**
 * Get process based on process name
 * @param {String} processName
 */
const getProcess = (processName) => {
  const latestProcessName = resolveLatestProcessName(processName);
  const processInfo = PROCESSES.find((process) => process.name === latestProcessName);
  if (processInfo) {
    return {
      ...processInfo.process,
      getState: getProcessState(processInfo.process),
      getStateAfterTransition: getStateAfterTransition(processInfo.process),
      getTransitionsToStates: getTransitionsToStates(processInfo.process),
      hasPassedState: hasPassedState(processInfo.process),
    };
  }
  const error = new Error(`Unknown transaction process name: ${processName}`);
  throw error;
};

exports.getProcess = getProcess;

/**
 * Get the info about supported processes: name, alias, unitTypes
 */
const getSupportedProcessesInfo = () =>
  PROCESSES.map((p) => {
    const { process, ...rest } = p;
    return rest;
  });

exports.getSupportedProcessesInfo = getSupportedProcessesInfo;

/**
 * Get all the transitions for every supported process
 */
const getAllTransitionsForEveryProcess = () => {
  return PROCESSES.reduce((accTransitions, processInfo) => {
    return [...accTransitions, ...Object.values(processInfo.process.transitions)];
  }, []);
};

exports.getAllTransitionsForEveryProcess = getAllTransitionsForEveryProcess;

/**
 * Check if the process is purchase process
 *
 * @param {String} processName
 */
const isPurchaseProcess = (processName) => {
  const latestProcessName = resolveLatestProcessName(processName);
  const processInfo = PROCESSES.find((process) => process.name === latestProcessName);
  return [PURCHASE_PROCESS_NAME].includes(processInfo?.name);
};

exports.isPurchaseProcess = isPurchaseProcess;

/**
 * Check if the process/alias points to a booking process
 *
 * @param {String} processAlias
 */
const isPurchaseProcessAlias = (processAlias) => {
  const processName = processAlias ? processAlias.split('/')[0] : null;
  return processAlias ? isPurchaseProcess(processName) : false;
};
exports.isPurchaseProcessAlias = isPurchaseProcessAlias;

/**
 * Check if the process is booking process
 *
 * @param {String} processName
 */
const isBookingProcess = (processName) => {
  const latestProcessName = resolveLatestProcessName(processName);
  const processInfo = PROCESSES.find((process) => process.name === latestProcessName);
  return [BOOKING_PROCESS_NAME].includes(processInfo?.name);
};

exports.isBookingProcess = isBookingProcess;

/**
 * Check if the process/alias points to a booking process
 *
 * @param {String} processAlias
 */
const isBookingProcessAlias = (processAlias) => {
  const processName = processAlias ? processAlias.split('/')[0] : null;
  return processAlias ? isBookingProcess(processName) : false;
};

exports.isBookingProcessAlias = isBookingProcessAlias;

const TX_TRANSITION_ACTOR_CUSTOMER = 'customer';
const TX_TRANSITION_ACTOR_PROVIDER = 'provider';
const TX_TRANSITION_ACTOR_SYSTEM = 'system';
const TX_TRANSITION_ACTOR_OPERATOR = 'operator';

exports.TX_TRANSITION_ACTOR_CUSTOMER = TX_TRANSITION_ACTOR_CUSTOMER;
exports.TX_TRANSITION_ACTOR_PROVIDER = TX_TRANSITION_ACTOR_PROVIDER;
exports.TX_TRANSITION_ACTOR_SYSTEM = TX_TRANSITION_ACTOR_SYSTEM;
exports.TX_TRANSITION_ACTOR_OPERATOR = TX_TRANSITION_ACTOR_OPERATOR;

exports.getAllNonFinalTransitions = () =>
  PROCESSES.reduce(
    (accTransitions, processInfo) => accTransitions.concat(processInfo.process.nonFinalTransitions),
    []
  );
