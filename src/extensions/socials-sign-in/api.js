// Change the API URL to match your server on the src/util/api.js file

export const createUserWithIdp = (body) => {
  return post('/api/socials-sign-in/auth/create-user-with-idp', body);
};
