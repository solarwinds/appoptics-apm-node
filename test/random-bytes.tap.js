'use strict';

const tap = require('tap');
const test = tap.test;

const RB = require('../lib/random-bytes.js');

test('random-bytes', function (t) {
  t.plan(4);

  t.test('the RandomBytes constructor works', function (t) {
    let rb1 = new RB();
    t.type(rb1, RB);
    t.equal(rb1.bufferSize, 1024, 'default buffer size is 1024');
    t.equal(rb1.bufferCount, 2, 'default buffer count is 2');

    rb1 = new RB({bufferSize: 512, bufferCount: 4});
    t.type(rb1, RB);
    t.equal(rb1.bufferSize, 512, 'buffer size is 512');
    t.equal(rb1.bufferCount, 4, 'buffer count is 4');

    t.done();
  });

  t.test('will fill with random bytes before buffers have been filled', function (t) {
    const rb1 = new RB();
    t.equal(rb1.asyncFills, 0, 'no async fills should have completed');
    const b = Buffer.allocUnsafe(512);
    rb1.fillWithRandomBytes(b, 0, 512);
    t.equal(rb1.syncFills, 1, 'the buffer should be filled synchronously');
    t.done();
  });

  t.test('will use random bytes from all buffers', function (t) {
    const rb1 = new RB();

    setTimeout(function () {
      for (let i = 0; i < rb1.bufferCount; i++) {
        t.equal(rb1.available[i].remaining, rb1.bufferSize, 'buffers should be full');
      }
      // use precisely all bytes
      const bSize = 512;
      const b = Buffer.allocUnsafe(bSize);
      for (let i = 0; i < rb1.bufferSize * rb1.bufferCount / bSize; i++) {
        rb1.fillWithRandomBytes(b, 0, 512);
      }
      for (let i = 0; i < rb1.bufferCount; i++) {
        t.equal(rb1.available[i].remaining, 0, 'buffers should be empty');
      }
      t.equal(rb1.syncFills, 0, 'no sync fills should take place');

      t.done();
    }, 250);
  });

  t.test('will refill when request is larger than remaining', function (t) {
    const rb1 = new RB();

    setTimeout(function () {
      for (let i = 0; i < rb1.bufferCount; i++) {
        t.equal(rb1.available[i].remaining, rb1.bufferSize, 'buffers should be full');
      }
      // use up each buffer with one request.
      const bSize = 768;
      const b = Buffer.allocUnsafe(bSize);

      for (let i = 0; i < rb1.bufferCount + 1; i++) {
        rb1.fillWithRandomBytes(b, 0, bSize);
      }
      // each buffer should be marked with 0 bytes left because they're in the
      // process of being refilled.
      for (let i = 0; i < rb1.bufferCount; i++) {
        t.equal(rb1.available[i].remaining, 0, 'buffers should be empty');
      }

      t.equal(rb1.syncFills, 1, 'the extra request should have been filled synchronously');
      t.equal(rb1.asyncFills, 2, 'both buffers should have been filled asynchronously');

      t.done();
    }, 250);
  });
});

