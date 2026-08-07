import { parse } from '../../util/urlHelpers';
import { verify } from '../../ducks/emailVerification.duck';

// ================ Thunks ================ //

export const loadData = (params, search) => (dispatch) => {
  const urlParams = parse(search);
  const verificationToken = urlParams.t;
  const token = verificationToken ? `${verificationToken}` : null;
  // No ?t= token in the URL (direct visit, or an email client mangled the link):
  // verify(null) would only fail into a "verification failed" banner, so skip it
  // and let the page render its "check your inbox" empty state instead.
  return token ? dispatch(verify(token)) : Promise.resolve();
};
