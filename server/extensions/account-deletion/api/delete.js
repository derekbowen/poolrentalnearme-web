const { getSdk, getTrustedSdk, handleError } = require('../../../api-util/sdk');
const { getAllNonFinalTransitions } = require('../../common/transactions/transaction');

const nonFinalTransitions = getAllNonFinalTransitions();

// Construct a 409 Conflict response with a message indicating the number of
// incomplete transactions.  If you want, you can also include the full list
// of transactions as 'data' in the response body.
const sendConflictResponse = (incompleteTransactions, res) => {
  const txLabel = incompleteTransactions.length === 1 ? 'transaction' : 'transactions';
  const message = `${incompleteTransactions.length} unfinished ${txLabel}.`;

  res.status(409).send({ status: 409, statusText: 'Conflict', message });
};

const getUserNonFinalTransactions = async (sdk) => {
  const incompleteTransactions = await sdk.transactions.query({
    lastTransitions: nonFinalTransitions,
  });

  return incompleteTransactions.data.data;
};

module.exports = async (req, res) => {
  try {
    const { currentPassword } = req.body;
    const sdk = getSdk(req, res);

    const incompleteTransactions = await getUserNonFinalTransactions(sdk);
    const deletable = incompleteTransactions.length === 0;

    const trustedSdk = await getTrustedSdk(req);
    if (deletable) {
      const response = await trustedSdk.currentUser.delete({ currentPassword });
      res.status(response.status).send(response);
    } else {
      sendConflictResponse(incompleteTransactions, res);
    }
  } catch (e) {
    handleError(res, e);
  }
};
