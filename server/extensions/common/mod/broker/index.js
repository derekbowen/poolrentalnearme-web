const EventHandler = require('extensions/event-handler/mod/broker/instance');

let instance;

const getBroker = async () => {
  if (instance) {
    return instance;
  }

  const broker = new EventHandler();
  await broker.init();

  instance = broker;

  return instance;
};

module.exports = getBroker;
