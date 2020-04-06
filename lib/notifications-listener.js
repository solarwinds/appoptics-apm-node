'use strict';

const ao = require('..');

// oboe config

// msg.seqNo 1
// msg.source 'oboe'
// msg.type 'config'
// msg.hostname 'collector.appoptics.com'
// msg.port 443
// msg.log ''
// msg.clientId maskedKey
// msg.buffersize 1000
// msg.maxTransactions 200
// msg.flushMaxWaitTime 5000
// msg.eventsFlushInterval 2
// msg.maxRequestSizeBytes 3000000
// msg.proxy ''

// msg.source 'oboe'
// msg.type 'keep-alive'

// msg.source 'oboe'
// msg.type 'logging'
// msg.level 'high|medium|low' ?
// msg.message 'Reporter successfully initialized'

// msg.source 'notifier'
// msg.type 'error'
// msg.error Error

// msg.source 'collector'
// msg.type 'remote-config'
// msg.config remote-config-name
// msg.value remote-config-value

const levels = {
  fatal: 'error',
  error: 'error',
  warn: 'warn',
  info: 'info',
  low: 'info',
  medium: 'info',
  high: 'info',
}

function notificationListener (msg) {
  if (msg.source === 'oboe') {
    if (msg.type === 'keep-alive') {
      return;
    } else if (msg.type === 'logging') {
      let logLevel = 'info';
      // map msg log levels to agent log levels if possible.
      if (msg.level in levels) {
        logLevel = levels[msg.level];
      }
      ao.loggers[logLevel](msg.message);
    } else if (msg.type === 'config') {
      ao.loggers.debug(`endpoint: ${msg.hostname}:${msg.port}`);
      ao.loggers.info('oboe-config: ', msg);
    } else {
      ao.loggers.debug('unexpected oboe message type: ', msg);
    }
  } else if (msg.source === 'collector') {
    if (msg.type === 'remote-config') {
      // take appropriate action
    } else if (msg.type === 'remote-warning') {
      if (msg.message.startsWith('The API token supplied was not found.')) {
        ao.loggers.error('Invalid serviceKey; AppOptics APM is disabled.');
      } else {
        ao.loggers.warn(msg.message);
      }
    } else {
      ao.loggers.debug('unexpected collector message type: ', msg);
      // log.debug();
    }
  } else if (msg.source === 'notifier') {
    if (msg.type === 'error' || msg.type === 'warn') {
      ao.loggers[msg.type]('notifier error: ', msg.error.message);
    } else {
      ao.loggers.debug('notifier error: ', msg.error);
    }
  } else {
    ao.loggers.debug('unknown source for:', msg);
  }

}

module.exports = notificationListener;
