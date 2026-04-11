export const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  return parts[1]?.split(';')[0];
};

export const getSuperLoginAsUser = (req) => {
  if (req) {
    return req.cookies['st-super-login-as-impersonating'];
  }
  if (typeof window === 'undefined') {
    return null;
  }
  return getCookie('st-super-login-as-impersonating');
};
