/* eslint-disable no-console */
'use strict';

async function fakeLambdaPromiser (event, context) {
  if (typeof event !== 'object') {
    throw new TypeError('event must be an object in the handler');
  }
  if (typeof context !== 'object') {
    throw new TypeError('context must be an object in the handler');
  }

  if (event.reject) {
    return Promise.reject({statusCode: 404});
  }

  return Promise.resolve({statusCode: 200});
}

function fakeLambdaCallbacker (event, context, callback) {
  callback(null, {statusCode: 200});
}

const aos = Symbol.for('AppOptics.Apm.Once');

module.exports = {
  // just make sure everything is as it is expected to be. the agent
  // is not loaded so the user's function is not wrapped.
  agentNotLoaded (event, context) {
    const output = {'test-data': {initialao: global[aos] !== undefined}};

    return fakeLambdaPromiser(event, context)
      .then(resolve => {
        Object.assign(output['test-data'], getAoTestData(), {resolve});
        return resolve;
      })
      .catch(reject => {
        Object.assign(output['test-data'], getAoTestData(), {reject});
        return reject;
      })
      .then(r => {
        console.log(JSON.stringify(output))
        return r;
      });
  },

  // make sure the wrapper works when the agent is disabled at startup.
  agentDisabled (event, context) {
    const output = {'test-data': {initialao: global[aos] !== undefined}};

    process.env.APPOPTICS_APM_CONFIG_NODE = './disabled-config.json';

    const ao = require('../..');
    const wrapped = ao.wrapLambdaHandler(fakeLambdaPromiser);

    return wrapped(event, context)
      .then(resolve => {
        Object.assign(output['test-data'], getAoTestData(), {resolve});
        return resolve;
      })
      .catch(reject => {
        Object.assign(output['test-data'], getAoTestData(), {reject});
        return reject;
      })
      .then(r => {
        console.log(JSON.stringify(output))
        return r;
      });
  },

  agentEnabled (event, context) {
    const output = {'test-data': {initialao: global[aos] !== undefined}};

    const ao = require('../..');

    const wrapped = ao.wrapLambdaHandler(fakeLambdaPromiser);

    return wrapped(event, context)
      .then(resolve => {
        Object.assign(output['test-data'], getAoTestData(), {resolve});
        return resolve;
      })
      .catch(reject => {
        Object.assign(output['test-data'], getAoTestData(), {reject});
        return reject;
      })
      .then(r => {
        console.log(JSON.stringify(output))
        return r;
      });
  },

  agentEnabledRejects (event, context) {
    const output = {'test-data': {initialao: global[aos] !== undefined}};

    const ao = require('../..');

    const wrapped = ao.wrapLambdaHandler(fakeLambdaPromiser);

    return wrapped(event, context)
      .then(resolve => {
        Object.assign(output['test-data'], getAoTestData(), {resolve});
        return resolve;
      })
      .catch(reject => {
        Object.assign(output['test-data'], getAoTestData(), {reject});
        return reject;
      })
      .then(r => {
        console.log(JSON.stringify(output))
        return r;
      });
  },
}

function getAoTestData (ao) {
  const props = [
    'execEnv',
    'cfg',
    'lambda',
  ];
  const o = {};
  if (ao) {
    for (let i = 0; i < props.length; i++) {
      o[props[i]] = ao[props[i]];
    }
  }
  return o;
}
