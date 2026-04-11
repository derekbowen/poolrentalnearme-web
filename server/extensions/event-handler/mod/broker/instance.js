const {
  SHARETRIBE_EVENT,
  SHARETRIBE_HORIZON_EVENT,
  SHARETRIBE_HORIZON_CUSTOM_KEY_EVENT,
} = require("../../common/config/events");

class EventHandler {
  currentBroker;
  subscription;
  EventHandlerMap;
  handler;
  message;
  init;
  constructor() {
    this.currentBroker = null;
    this.subscription = null;
    this.EventHandlerMap = {
      [SHARETRIBE_EVENT]: [],
      [SHARETRIBE_HORIZON_EVENT]: [],
      [SHARETRIBE_HORIZON_CUSTOM_KEY_EVENT]: [],
    };
    this.handler = {
      add: require("./handler/add").bind(this),
      remove: require("./handler/remove").bind(this),
    };
    this.message = {
      publish: require("./message/publish").bind(this),
    };
    this.init = require("./initiate").bind(this);
  }
}

module.exports = EventHandler;
