import { boot, shutdown } from '@intercom/messenger-js-sdk';
import { intercomAppId } from '../../config/intercom';

const signOutIntercom = () => {
  if (typeof window !== 'undefined' && window.Intercom) {
    shutdown();
    boot({ app_id: intercomAppId });
  }
};

export default signOutIntercom;
