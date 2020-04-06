'use strict';

const net = require('net');
const EventEmitter = require('events').EventEmitter;

let aob;
try {
  aob = require('appoptics-bindings');
} catch (e) {
  aob = require('./addon-sim');
}

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

// msg.source 'agent'
// msg.type 'error'
// msg.error Error

// msg.source 'collector'
// msg.type 'remote-config'
// msg.config remote-config-name
// msg.value remote-config-value

// msg.source 'oboe'
// msg.type 'keep-alive'

class Notifications extends EventEmitter {
  constructor (consumer, options = {}) {
    super();
    if (typeof consumer !== 'function') {
      throw new TypeError('consumer must be a function');
    }
    // allow for testing
    if (options.aob) {
      aob = options.aob;
    }
    this.client = undefined;
    this.previousData = '';
    this.socketPrefix = options.socketPrefix || 'ao-notifier-';
    this.socket = undefined;
    this.expectedSeqNo = 0;
    this.server = undefined;
    this.serverStatus = undefined;
    this.consumer = consumer;
    this.on('message', function (msg) {consumer(msg)})

    this.startServer();
  }

  startServer (options = {}) {
    if (this.server) {
      throw new Error('server already exists');
    }

    // create a server that only allows one client.
    this.server = net.createServer(client => {
      if (this.client) {
        // TODO - close and reinitialize?
        throw new Error('more than one client connection');
      }
      this.client = client;
      this.client.on('end', () => {
        this.client = undefined;
      });

      this.client.on('data', data => {
        this.previousData = this.previousData + data.toString('utf8');
        // each message ends in a newline. it's possible that a full message
        // might not arrive in one 'data' event or that more than one message
        // arrives in one event.
        let ix;
        while ((ix = this.previousData.indexOf('\n')) >= 0) {
          const json = this.previousData.substring(0, ix);
          this.previousData = this.previousData.substring(ix + 1);
          try {
            const msg = JSON.parse(json);
            this.emit('message', msg);
            if (this.expectedSeqNo !== msg.seqNo) {
              const text = `found seqNo ${msg.seqNo} when expecting ${this.expectedSeqNo}`;
              this.emit('message', errorMessage(new Error(text)));
              // set to message value so not every message will generate an
              // error if it gets out of sync once.
              this.expectedSeqNo = msg.seqNo;
            }
            this.expectedSeqNo += 1;
          } catch (e) {
            // if it can't be parsed tell the consumer.
            this.emit('message', errorMessage(e));
          }
        }
      });
    });
    this.serverStatus = 'created';

    const max = 10;
    for (let i = 0; i < max; i++) {
      this.socket = this.socketPrefix + randomDigits();
      try {
        this.server.listen(this.socket);
        this.serverStatus = 'listening';
        break;
      } catch (e) {
        // not sure how to handle not being able to listen on any socket.
        if (e.code !== 'EADDRINUSE') {
          this.server.close(e => {
            this.server = undefined;
            this.serverStatus = 'initial';
          });
          throw e;
        }
      }
    }
  }

  stopServer () {
    if (this.client) {
      this.client.destroy();
    }
    this.server.close(() => {
      this.serverStatus = 'initial';
    })
  }

  startNotifier () {
    const status = aob.Notifier.init(this.socket);
    return status;
  }

  // returns promise that resolves when the requested components are stopped.
  async stopNotifier (options = {}) {
    return new Promise((resolve, reject) => {

      const status = aob.Notifier.stop();
      if (status === -1) {
        // it's "disabled" somehow but no reason to wait in this case.
        resolve(status);
        return;
      }
      if (status !== -3) {
        // it should have been "shutting-down"
        reject(status);
        return;
      }

      // wait for the notifier to get to disabled state
      let counter = 0;
      const iid = setInterval(() => {
        const status = this.getStatus();
        // is it "disabled" yet?
        if (status === -1) {
          clearInterval(iid);
          resolve(status);
          return;
        }
        // the client hasn't stopped yet
        counter += 1;
        if (counter > 10) {
          clearInterval(iid);
          reject(new Error('notifier-stop timed out'));
        }
      }, 5000);
    })
  }

  getStatus () {
    // OBOE_NOTIFIER_SHUTTING_DOWN - 3
    // OBOE_NOTIFIER_INITIALIZING - 2
    // OBOE_NOTIFIER_DISABLED - 1
    // OBOE_NOTIFIER_OK 0
    // OBOE_NOTIFIER_SOCKET_PATH_TOO_LONG 1
    // OBOE_NOTIFIER_SOCKET_CREATE 2
    // OBOE_NOTIFIER_SOCKET_CONNECT 3
    // OBOE_NOTIFIER_SOCKET_WRITE_FULL 4
    // OBOE_NOTIFIER_SOCKET_WRITE_ERROR 5
    // OBOE_NOTIFIER_SHUTDOWN_TIMED_OUT 6
    return aob.Notifier.status();
  }

}

function randomDigits () {
  return Math.trunc(Math.random() * 1000000000000);
}

function errorMessage (error) {
  return {source: 'notifier', type: 'error', error};
}

module.exports = Notifications;
