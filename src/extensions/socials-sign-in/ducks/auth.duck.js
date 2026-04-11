/**
 * Replace the following code in auth.duck.js:
 */

export const authenticationInProgress = (state) => {
  const { loginInProgress, logoutInProgress, signupInProgress, confirmInProgress } = state.auth;
  return loginInProgress || logoutInProgress || signupInProgress || confirmInProgress;
};
