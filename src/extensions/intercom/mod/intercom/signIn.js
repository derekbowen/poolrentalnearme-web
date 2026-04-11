import { boot } from '@intercom/messenger-js-sdk';
import { intercomAppId } from '../../config/intercom';

const signInIntercom = (currentUser) => {
  if (typeof window !== 'undefined' && window.Intercom) {
    const {
      attributes: {
        email,
        createdAt,
        profile: { displayName },
      },
      id: { uuid },
    } = currentUser;
    boot({
      app_id: intercomAppId,
      email,
      user_id: uuid,
      created_at: createdAt,
      name: displayName,
    });
  }
};

export default signInIntercom;
