'use strict';

const aob = require('../../lib/addon-sim');
const Notifications = require('../../lib/notifications');

const expect = require('chai').expect;

// eslint-disable-next-line no-unused-vars
function psoon () {
  return new Promise((resolve, reject) => {
    process.nextTick(resolve)
  })
}

const messages = [];

// Without the native liboboe bindings present the notifier should
// initialize correctly.
describe('notifier (without native bindings present)', function () {
  let notifications;

  it('should initialize without error', function () {
    notifications = new Notifications(msg => messages.push(msg), aob);
    expect(notifications.serverStatus).equal('listening', 'serverStatus should be "listening"');
  });

  it('should simulate starting the notifier', function () {
    const status = notifications.startNotifier();
    expect(status).oneOf([0, -2], 'status should be OK or INITIALIZING');
  });

  it('should simulate stopping the notifier', function () {
    return notifications.stopNotifier()
      .then(status => {
        expect(status).equal(-1, 'status should be DISABLED');
      });
  });

  it('should get status without error', function () {
    const status = notifications.getStatus();
    expect(status).equal(-1, 'status should be DISABLED');
  });

})
