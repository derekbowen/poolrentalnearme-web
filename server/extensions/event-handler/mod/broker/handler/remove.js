async function removeHandler({ eventType, id }) {
  if (!this.EventHandlerMap[eventType]) {
    throw new Error(`Unknown event type: ${eventType}`);
  }

  this.EventHandlerMap[eventType] = this.EventHandlerMap[eventType].filter(
    (handler) => handler.id !== id
  );
}

module.exports = removeHandler;
