'use strict';

// the following three must be in sync, i.e., all refer to staging or production
// as well as REPORTER specifying that the COLLECTOR should be used.
process.env.APPOPTICS_COLLECTOR = 'collector.appoptics.com';
process.env.APPOPTICS_REPORTER = 'ssl';
const swoken = process.env.AO_TOKEN_PROD;

const name = 'swoken-Modification-test';

process.env.APPOPTICS_SERVICE_KEY = `${swoken}:${name}`;

const ao = require('../..');
const assert = require('assert');


describe('verify that a swoken is handled correctly', function () {
  it('the service name should be lower case', function () {
    assert.strictEqual(ao.cfg.serviceKey, `${swoken}:${name.toLowerCase()}`);
  });

  it('shouldn\'t change the environment variable', function () {
    assert.strictEqual(process.env.APPOPTICS_SERVICE_KEY, `${swoken}:${name}`);
  });

  it('should validate with the collector using the swoken', function () {
    const o = {};
    const ready = ao.readyToSample(5000, o);
    assert.strictEqual(o.status, 1, `expected status 1, not ${o.status}`);
    // return value should be true
    assert.strictEqual(ready, true, 'should return boolean true');
  });
})
