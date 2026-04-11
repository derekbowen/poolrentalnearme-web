/**
 * Export loadData calls from ducks modules of different containers
 */
import { setInitialValues as CheckoutPageInitialValues } from './CheckoutPage/CheckoutPage.duck';
import { setInitialValues as TransactionPageInitialValues } from './TransactionPage/TransactionPage.duck';

const getPageDataLoadingAPI = () => {
  return {
    CheckoutPage: {
      setInitialValues: CheckoutPageInitialValues,
    },
    TransactionPage: {
      setInitialValues: TransactionPageInitialValues,
    },
  };
};

export default getPageDataLoadingAPI;
