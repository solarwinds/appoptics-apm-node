'use strict';

// the following three must be in sync, i.e., all refer to staging or production
// as well as REPORTER specifying that the COLLECTOR should be used.
process.env.APPOPTICS_COLLECTOR = 'collector-stg.appoptics.com';
process.env.APPOPTICS_REPORTER = 'ssl';
const swoken = process.env.AO_SWOKEN_STG;

const name = 'swoken-Modification-test';

process.env.APPOPTICS_SERVICE_KEY = `${swoken}:${name}`;

const ao = require('../..');
const assert = require('assert');


describe('verify that a swoken is handled correctly', function () {
  it('the service name should be lower case', function () {
    assert(ao.serviceKey === `${swoken}:${name.toLowerCase()}`);
  });
  it('the config should not be changed', function () {
    assert(ao.cfg.serviceKey === undefined);
  });
  it('shouldn\'t change the environment variable', function () {
    assert(process.env.APPOPTICS_SERVICE_KEY === `${swoken}:${name}`);
  })
  it('should validate with the collector using the swoken', function () {
    const ready = ao.readyToSample(5000);
    assert(ready);
  })
})
