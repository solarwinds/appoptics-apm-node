/* eslint-disable no-console */
'use strict';

async function fakeLambdaPromiser (event, context) {
  if (typeof event !== 'object') {
    throw new TypeError('event must be an object in the handler');
  }
  if (typeof context !== 'object') {
    throw new TypeError('context must be an object in the handler');
  }

  if (typeof event.reject === 'number') {
    return Promise.reject({statusCode: event.reject});
  }

  if (typeof event.throw === 'string') {
    throw new Error(event.throw);
  }

  if (event.reject) {
    throw new TypeError(`invalid reject value: ${event.reject}`);
  }
  if (event.throw) {
    throw new TypeError(`invalid throw value: ${event.throw}`);
  }

  return Promise.resolve({statusCode: 200});
}

function fakeLambdaCallbacker (event, context, callback) {
  if (typeof event !== 'object') {
    throw new TypeError('event must be an object in the handler');
  }
  if (typeof context !== 'object') {
    throw new TypeError('context must be an object in the handler');
  }
  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  let error;
  if (typeof event.error === 'string') {
    error = new Error(event.error);
  }
  if (typeof event.throw === 'string') {
    throw new Error(event.throw);
  }

  // callback using "lambda-supplied" callback
  callback(error, {statusCode: 200});
}

const aos = Symbol.for('AppOptics.Apm.Once');

module.exports = {
  // just make sure everything is as it is expected to be. the agent
  // is not loaded so the user's function is not wrapped.
  agentNotLoaded (event, context) {
    const output = {'test-data': {initialao: global[aos] !== undefined}};

    return fakeLambdaPromiser(event, context)
      .then(resolve => {
        Object.assign(output['test-data'], {resolve});
        return resolve;
      })
      .catch(reject => {
        Object.assign(output['test-data'], {reject});
        return reject;
      })
      .then(r => {
        console.log(JSON.stringify(output));
        return r;
      });
  },

  agentNotLoadedCB (event, context) {
    const output = {'test-data': {initialao: global[aos] !== undefined}};

    function cb (error, result) {
      console.log(JSON.stringify(output));
    }

    return fakeLambdaCallbacker(event, context, cb);
  },

  // make sure the wrapper works when the agent is disabled at startup.
  agentDisabled (event, context) {
    const output = {'test-data': {initialao: global[aos] !== undefined}};

    process.env.APPOPTICS_APM_CONFIG_NODE = './disabled-config.json';

    const ao = require('../..');
    const wrapped = ao.wrapLambdaHandler(fakeLambdaPromiser);

    return wrapped(event, context)
      .then(resolve => {
        Object.assign(output['test-data'], getAoTestData(ao), {resolve});
        return resolve;
      })
      .catch(reject => {
        Object.assign(output['test-data'], getAoTestData(ao), {reject});
        return reject;
      })
      .then(r => {
        console.log(JSON.stringify(output))
        return r;
      });
  },

  agentDisabledCB (event, context) {
    const output = {'test-data': {initialao: global[aos] !== undefined}};

    process.env.APPOPTICS_APM_CONFIG_NODE = './disabled-config.json';

    const ao = require('../..');
    const wrapped = ao.wrapLambdaHandler(fakeLambdaPromiser);

    function cb (error, result) {
      //
    }

    return wrapped(event, context, cb)
      .then(result => {
        Object.assign(output, {result});
        console.log(JSON.stringify(output));
        return result;
      })
      .catch(error => {
        Object.assign(output, {error});
        console.log(JSON.stringify(output));
        return error;
      })
  },

  agentEnabled (event, context) {
    const output = {'test-data': {initialao: global[aos] !== undefined}};

    const ao = require('../..');
    const wrapped = ao.wrapLambdaHandler(fakeLambdaPromiser);

    return wrapped(event, context)
      .then(resolve => {
        Object.assign(output['test-data'], getAoTestData(ao), {resolve});
        return resolve;
      })
      .catch(reject => {
        Object.assign(output['test-data'], getAoTestData(ao), {reject});
        return reject;
      })
      .then(r => {
        Object.assign(output['test-data'], {result: r});
        console.log(JSON.stringify(output));
        return r;
      });
  },

  agentEnabledCB (event, context) {
    const output = {'test-data': {initialao: global[aos] !== undefined}};

    const ao = require('../..');
    const wrapped = ao.wrapLambdaHandler(fakeLambdaCallbacker);

    function cb (error, result) {
      // don't even need this function
    }

    wrapped(event, context, cb)
      .then(resolve => {
        Object.assign(output['test-data'], {resolve}, getAoTestData(ao));
        return output;
      })
      .catch(reject => {
        Object.assign(output['test-data'], {reject});
        return output;
      })
      .then(r => {
        console.log(JSON.stringify(output));
        return r;
      })
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
