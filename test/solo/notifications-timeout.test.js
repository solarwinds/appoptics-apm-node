'use strict';

// oboe's notifier will send all log messages
process.env.APPOPTICS_DEBUG_LEVEL = 3;

const ao = require('../..');
const notifications = ao.notifications;
const expect = require('chai').expect;

const messages = [];

notifications.on('message', function (msg) {
  messages.push(msg);
})


describe('notification function tests (long tests)', function () {
  it('should receive at least 4 keep-alive messages in a minute', function (done) {
    let keepAliveCount = 0;
    this.timeout(70000);
    setTimeout(function () {
      messages.forEach(m => {
        if (m.source === 'oboe' && m.type === 'keep-alive') {
          keepAliveCount += 1;
        }
      });
      expect(keepAliveCount).gte(4, 'at least 4 keep-alive messages');
      done();
    }, 60000);
  });

  it('should handle restarting if keep-alive messages do not arrive', function (done) {
    this.timeout(35000);

    const timeToStop = Date.now() + 30 * 1000;
    const iid = setInterval(function () {
      // fake keep-alives not arriving my setting the last message time to
      // the distant past.
      notifications.lastMessageTimestamp = 0;
      if (Date.now() > timeToStop) {
        clearInterval(iid);
        throw new Error('exceeded wait time');
      }
      if (notifications.startCount > 1) {
        clearInterval(iid);
        done();
      }
    }, 250);
  });
});
