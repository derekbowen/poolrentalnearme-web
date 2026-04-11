export const getPaymentParams = ({ billingDetails }) => {
  return {
    payment_method_data: {
      billing_details: billingDetails,
    },
  };
};

export const getClientSecret = (setupIntent) => {
  return setupIntent?.attributes ? setupIntent.attributes.clientSecret : null;
};
