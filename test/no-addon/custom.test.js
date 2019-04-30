'use strict';

process.env.AO_TEST_NO_BINDINGS = '1';

const ao = require('../..');
const assert = require('assert');


//
//                 ^     ^
//            __--| \:::/ |___
//    __---```   /    ;;;  \  ``---___
//      -----__ |   (@  \\  )       _-`
//             ```--___   \\ \   _-`
//                     ````----``
//     /````\  /```\   /```\  |`\   ||
//     ||``\| |/```\| |/```\| ||\\  ||
//      \\    ||   || ||   || || || ||
//        \\  ||   || ||   || || || ||
//     |\__|| |\___/| |\___/| ||  \\||
//     \____/  \___/   \___/  ||   \_|
//

const soon = global.setImmediate || process.nextTick

function psoon () {
  return new Promise((resolve, reject) => {
    soon(() => resolve())
  })
}

// Without the native liboboe bindings present,
// the custom instrumentation should be a no-op
describe('custom (without native bindings present)', function () {
  it('should have a version of \'not loaded\'', function () {
    assert(ao.addon.version === 'not loaded');
  });

  it('should passthrough sync instrument', function () {
    let counter = 0;
    ao.instrument('test', function () {
      counter++;
    })
    assert(counter === 1, 'counter should be 1');
  })

  it('should passthrough async instrument', function (done) {
    function localDone () {
      done();
    }
    ao.instrument('test', soon, {}, localDone);
  })

  it('should passthrough pInstrument', function () {
    let counter = 0;

    function pfunc () {
      counter += 1;
      return Promise.resolve(99);
    }

    return ao.pInstrument('test', pfunc).then(r => {
      assert(counter === 1, 'counter should be 1');
      assert(r === 99, 'the result of pInstrument should be 99');
      return r;
    })
  })

  it('should passthrough sync startOrContinueTrace', function () {
    let counter = 0
    ao.startOrContinueTrace(null, 'test', function () {
      counter++
    })
    assert(counter === 1, 'counter should be equal to 1');
  })

  it('should passthrough async startOrContinueTrace', function (done) {
    function localDone () {
      done();
    }
    ao.startOrContinueTrace(null, 'test', soon, localDone)
  })

  it('should passthrough pStartOrContinueTrace', function () {
    let counter = 0;

    function pfunc () {
      counter += 1;
      return Promise.resolve(99);
    }
    return ao.pStartOrContinueTrace(null, 'test', pfunc).then(r => {
      assert(counter === 1, 'counter should be 1');
      assert(r === 99, 'the result of pStartOrContinueTrace should be 99');
      return r;
    })
  })

  it('should support callback shifting', function (done) {
    ao.instrument('test', soon, done)
  })

  it('should not fail when accessing traceId', function () {
    assert(ao.traceId === undefined);
  })
})
