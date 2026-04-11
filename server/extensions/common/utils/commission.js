const { fetchCommission } = require('../../../api-util/sdk');

const isValidCommissionPercentage = (commission) => {
  const percentage = commission?.percentage;
  const isNumber = typeof percentage === 'number' && !Number.isNaN(percentage);
  const isMoreThanZero = isNumber && percentage > 0;

  return isMoreThanZero;
};

exports.fetchMarketplaceCommission = async (sdk) => {
  try {
    const response = await fetchCommission(sdk);
    const commissionAsset = response.data.data[0];

    const { providerCommission = null, customerCommission = null } =
      commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

    const providerCommissionPercentageIsValid = isValidCommissionPercentage(providerCommission);
    const customerCommissionPercentageIsValid = isValidCommissionPercentage(customerCommission);

    return {
      providerCommission: providerCommissionPercentageIsValid ? providerCommission : null,
      customerCommission: customerCommissionPercentageIsValid ? customerCommission : null,
    };
  } catch (e) {
    console.error('Error fetching marketplace commission:', e);
    return {
      providerCommission: null,
      customerCommission: null,
    };
  }
};
