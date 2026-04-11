async function addHandler({ eventType, handler }) {
  if (!this.EventHandlerMap[eventType]) {
    throw new Error(`Unknown event type: ${eventType}`);
  }

  if (typeof handler !== "function") {
    throw new Error("Handler must be a function");
  }

  const id = new Date().getTime();

  const handlerObj = {
    id,
    fnc: handler,
  };
  if (this.EventHandlerMap[eventType]) {
    this.EventHandlerMap[eventType].push(handlerObj);
  } else {
    this.EventHandlerMap[eventType] = [handlerObj];
  }

  return id;
}

module.exports = addHandler;
