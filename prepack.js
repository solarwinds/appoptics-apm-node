#!/usr/bin/env node
'use strict';

const fs = require('fs');

const files = fs.readdirSync('.', 'utf8');

let errorCount = 0;

//
// make sure that there are no ubuntu-* files left around
//
for (let i = files.length - 1; i >= 0; i--) {
  if (files[i].indexOf('ubuntu-') === 0) {
    errorCount += 1;
  }
}

if (errorCount) {
  // eslint-disable-next-line no-console
  console.error('ubuntu-* files found - delete before packing or publishing');
}

//
// make sure api-sim supplies all the functions in api. this doesn't verify that
// all functions operate in a compatible way. that can be added over time if errors
// are found.
//
const skeletalAo = {
  loggers: {
    addGroup () {},
  },
  logger: {
    Debounce () {},
    addEnabled () {},
  }
};

const aoSim = require('./lib/api-sim')(Object.assign({}, skeletalAo));
const aoApi = require('./lib/api')(Object.assign({}, skeletalAo));

const apiKeys = new Set([...Object.getOwnPropertyNames(aoApi)]);
const simKeys = new Set([...Object.getOwnPropertyNames(aoSim)]);

const missing = new Set();

for (const key of apiKeys) {
  if (!simKeys.has(key)) {
    missing.add(key);
  }
}

if (missing.size) {
  errorCount += 1;
  // eslint-disable-next-line no-console
  console.error('api keys missing from the simulated api:', [...missing].join(', '));
}

//
// exit appropriately
//
process.exit(errorCount ? 1 : 0);
