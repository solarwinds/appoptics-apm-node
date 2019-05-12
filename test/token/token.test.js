'use strict';

// the following three must be in sync, i.e., all refer to staging or production
// as well as REPORTER specifying that the COLLECTOR should be used.
process.env.APPOPTICS_COLLECTOR = 'collector-stg.appoptics.com';
process.env.APPOPTICS_REPORTER = 'ssl';
const token = process.env.AO_TOKEN_STG;

const name = 'token-Modification-test';

process.env.APPOPTICS_SERVICE_KEY = `${token}:${name}`;

const ao = require('../..');
const assert = require('assert');


describe('verify that a legacy token is handled correctly', function () {
  it('the service name should be lower case', function () {
    assert(ao.serviceKey === `${token}:${name.toLowerCase()}`);
  });
  it('the config should not be changed', function () {
    assert(ao.cfg.serviceKey === undefined);
  });
  it('shouldn\'t change the environment variable', function () {
    assert(process.env.APPOPTICS_SERVICE_KEY === `${token}:${name}`);
  })
  it('should validate with the collector using the token', function () {
    const ready = ao.readyToSample(5000);
    assert(ready);
  })
})
