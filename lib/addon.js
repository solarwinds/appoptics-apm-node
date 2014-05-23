'use strict';

try {
  module.exports = require('../build/Release/node-oboe');
} catch (e) {
  try {
    module.exports = require('../build/Debug/node-oboe');
  } catch (e) {
    throw new Error('Could not find liboboe native bindings');
  }
}
