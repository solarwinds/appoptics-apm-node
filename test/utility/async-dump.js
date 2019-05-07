'use strict';

const {createHook} = require('async_hooks');

let stackTraceFilter;

try {
  stackTraceFilter = require('mocha/lib/utils').stackTraceFilter;
} catch (e) {
  const globalNode = `${process.env.NVM_DIR}/versions/node/${process.version}/lib/node_modules`;
  stackTraceFilter = require(`${globalNode}/mocha/lib/utils`).stackTraceFilter;
}

const allResources = new Map();

// consider using wtfnode.

// this will pull Mocha internals out of the stacks
const filterStack = stackTraceFilter();

const hook = createHook({
  init (asyncId, type, triggerAsyncId) {
    allResources.set(asyncId, {type, triggerAsyncId, stack: (new Error()).stack});
  },
  destroy (asyncId) {
    allResources.delete(asyncId);
  }
}).enable();

global.asyncDump = module.exports = () => {
  hook.disable();
  /* eslint-disable no-console */
  console.error('STUFF STILL IN THE EVENT LOOP:');
  allResources.forEach(value => {
    console.error(`Type: ${value.type}`);
    console.error(filterStack(value.stack));
    console.error('\n');
  });
};
