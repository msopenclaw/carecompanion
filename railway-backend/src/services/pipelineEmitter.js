const { EventEmitter } = require("events");

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

function emitPipelineEvent(userId, event) {
  emitter.emit(`pipeline:${userId}`, event);
}

function onPipelineEvent(userId, listener) {
  emitter.on(`pipeline:${userId}`, listener);
  return () => emitter.removeListener(`pipeline:${userId}`, listener);
}

module.exports = { emitPipelineEvent, onPipelineEvent };
