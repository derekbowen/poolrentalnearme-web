import Intercom from '@intercom/messenger-js-sdk';
import { intercomAppId } from '../../config/intercom';

let intercomInitiated = false;

const initIntercom = () => {
  if (!intercomInitiated) {
    Intercom({
      app_id: intercomAppId,
    });
    intercomInitiated = true;
  }
};

export default initIntercom;
