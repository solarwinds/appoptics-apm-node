'use strict';
/*
 *
 */

const EventEmitter = require('events');
const util = require('util');
const winston = require('winston');

// used to remove escape codes from log message
const code = /\u001b\[(\d+(;\d+)*)?m/g; // eslint-disable-line no-control-regex


//
function TestEmitter (options) {
  options = options || {};

  if (options.version !== 1 && options.version !== 2) {
    throw new TypeError(`options.version is ${options.version}; it must be 1 or 2`);
  }
  const {version} = options;
  this.version = version;

  if (version === 1) {
    winston.Transport.call(this, options);
  }

  this.name = 'test-emitter';

  this.timestamp = options.timestamp || false;
  this.stripColors = options.stripColors || false;
}

//
// Inherit from `winston.Transport`.
//
util.inherits(TestEmitter, winston.Transport);

// make it an emitter
util.inherits(TestEmitter, EventEmitter);

exports.TestEmitter = winston.transports.TestEmitter = TestEmitter;


//
// Expose the name of this Transport on the prototype
//
TestEmitter.prototype.name = 'test-emitter';

//
// ### function log (level, msg, [meta], callback)
// #### @level {string} Level at which to log the message.
// #### @msg {string} Message to log
// #### @meta {Object} **Optional** Additional metadata to attach
// #### @callback {function} Continuation to respond to when complete.
// Core logging method exposed to Winston. Metadata is optional.
//
TestEmitter.prototype.log = function (level, msg, meta, callback) {
  if (this.stripColors) {
    msg = ('' + msg).replace(code, '');
  }

  //
  // Helper function for responded to logging.
  //
  this.emit('test-log', level, msg, meta);

  callback(null, true);

};

