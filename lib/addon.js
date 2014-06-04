'use strict';

try {
  module.exports = require('bindings')('node-oboe.node')
} catch (e) {
  throw new Error('Could not find liboboe native bindings')
}
