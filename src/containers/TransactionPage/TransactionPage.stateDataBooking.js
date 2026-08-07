import {
  TX_TRANSITION_ACTOR_CUSTOMER as CUSTOMER,
  TX_TRANSITION_ACTOR_PROVIDER as PROVIDER,
  CONDITIONAL_RESOLVER_WILDCARD,
  ConditionalResolver,
} from '../../transactions/transaction';

/**
 * Get state data against booking process for TransactionPage's UI.
 * I.e. info about showing action buttons, current state etc.
 *
 * @param {*} txInfo detials about transaction
 * @param {*} processInfo  details about process
 */
export const getStateDataForBookingProcess = (txInfo, processInfo) => {
  const { transaction, transactionRole, nextTransitions } = txInfo;
  const isProviderBanned = transaction?.provider?.attributes?.banned;
  const isCustomerBanned = transaction?.customer?.attributes?.banned;
  const _ = CONDITIONAL_RESOLVER_WILDCARD;

  const {
    processName,
    processState,
    states,
    transitions,
    isCustomer,
    actionButtonProps,
    leaveReviewProps,
  } = processInfo;

  return new ConditionalResolver([processState, transactionRole])
    .cond([states.INQUIRY, CUSTOMER], () => {
      const transitionNames = Array.isArray(nextTransitions)
        ? nextTransitions.map(t => t.attributes.name)
        : [];
      const requestAfterInquiry = transitions.REQUEST_PAYMENT_AFTER_INQUIRY;
      const hasCorrectNextTransition = transitionNames.includes(requestAfterInquiry);
      const showOrderPanel = !isProviderBanned && hasCorrectNextTransition;
      return { processName, processState, showOrderPanel };
    })
    .cond([states.INQUIRY, PROVIDER], () => {
      return { processName, processState, showDetailCardHeadings: true, showSendOfferPanel: true };
    })
    .cond([states.OFFER_SENT, CUSTOMER], () => {
      const pendingOffer = transaction?.attributes?.protectedData?.pendingOffer;
      const secondary = actionButtonProps(transitions.DECLINE_OFFER, CUSTOMER);
      // The guest accepts by picking a date/time in the OrderPanel and
      // continuing to checkout, where the transaction is priced from the
      // negotiated offer (getRequestTransition returns ACCEPT_OFFER for an
      // offer-sent tx; CheckoutPage routes it to /api/accept-offer). The
      // offerAccept context tells the OrderPanel to show the agreed package
      // price instead of the hourly estimate.
      const canAccept = !isProviderBanned && !!pendingOffer?.negotiatedPriceCents;
      const offerAccept = canAccept
        ? {
            negotiatedPriceCents: pendingOffer.negotiatedPriceCents,
            currency: pendingOffer.currency || 'USD',
          }
        : null;
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showPendingOffer: true,
        pendingOffer,
        showOrderPanel: canAccept,
        offerAccept,
        showActionButtons: !!secondary,
        secondaryButtonProps: secondary,
      };
    })
    .cond([states.OFFER_SENT, PROVIDER], () => {
      return { processName, processState, showDetailCardHeadings: true };
    })
    .cond([states.PREAUTHORIZED, CUSTOMER], () => {
      return { processName, processState, showDetailCardHeadings: true, showExtraInfo: true };
    })
    .cond([states.PREAUTHORIZED, PROVIDER], () => {
      const primary = isCustomerBanned ? null : actionButtonProps(transitions.ACCEPT, PROVIDER);
      const secondary = isCustomerBanned ? null : actionButtonProps(transitions.DECLINE, PROVIDER);
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showActionButtons: true,
        primaryButtonProps: primary,
        secondaryButtonProps: secondary,
      };
    })
    .cond([states.REQUESTED, CUSTOMER], () => {
      return { processName, processState, showDetailCardHeadings: true, showExtraInfo: true };
    })
    .cond([states.REQUESTED, PROVIDER], () => {
      const primary = isCustomerBanned ? null : actionButtonProps(transitions.ACCEPT_WITH_PAYMENT, PROVIDER);
      const secondary = isCustomerBanned ? null : actionButtonProps(transitions.DECLINE_WITHOUT_PAYMENT, PROVIDER);
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showActionButtons: true,
        primaryButtonProps: primary,
        secondaryButtonProps: secondary,
      };
    })
    .cond([states.DELIVERED, _], () => {
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showReviewAsFirstLink: true,
        showActionButtons: true,
        primaryButtonProps: leaveReviewProps,
      };
    })
    .cond([states.REVIEWED_BY_PROVIDER, CUSTOMER], () => {
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showReviewAsSecondLink: true,
        showActionButtons: true,
        primaryButtonProps: leaveReviewProps,
      };
    })
    .cond([states.REVIEWED_BY_CUSTOMER, PROVIDER], () => {
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showReviewAsSecondLink: true,
        showActionButtons: true,
        primaryButtonProps: leaveReviewProps,
      };
    })
    .cond([states.REVIEWED, _], () => {
      return { processName, processState, showDetailCardHeadings: true, showReviews: true };
    })
    .default(() => {
      // Default values for other states
      return { processName, processState, showDetailCardHeadings: true };
    })
    .resolve();
};
