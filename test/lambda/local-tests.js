/* eslint-disable no-console */
'use strict';

const util = require('util');

const aoLambdaTest = 'ao-lambda-test';

async function fakeLambdaPromiser (event, context) {
  if (typeof event !== 'object') {
    throw new TypeError('event must be an object in the handler');
  }
  if (typeof context !== 'object') {
    throw new TypeError('context must be an object in the handler');
  }

  const modifiers = context[aoLambdaTest] || {};

  if (typeof modifiers.reject === 'number') {
    return Promise.reject({statusCode: modifiers.reject});
  }

  if (typeof modifiers.throw === 'string') {
    throw new Error(modifiers.throw);
  }

  if (modifiers.reject) {
    throw new TypeError(`invalid reject value: ${modifiers.reject}`);
  }
  if (modifiers.throw) {
    throw new TypeError(`invalid throw value: ${modifiers.throw}`);
  }
  let response = {statusCode: 200};
  if (modifiers.resolve) {
    response = modifiers.resolve;
  }
  if (modifiers['resolve-error']) {
    response = new Error(modifiers['resolve-error']);
  }

  return Promise.resolve(response);
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

  const modifiers = context[aoLambdaTest] || {};

  let error;
  if (typeof modifiers.error === 'string') {
    error = new Error(modifiers.error);
  }
  if (typeof modifiers.throw === 'string') {
    throw new Error(modifiers.throw);
  }
  let response = {statusCode: 200};
  if (modifiers.resolve) {
    response = modifiers.resolve;
  }

  // callback using "lambda-supplied" callback
  callback(error, response);
}

const aos = Symbol.for('AppOptics.Apm.Once');

module.exports = {
  // look in the context data for this symbol for additional instructions.
  aoLambdaTest,
  runtimeRequirePath: __filename,
  load (taskRoot, handler) {
    const ix = handler.lastIndexOf('.');
    const handlerName = handler.slice(ix + 1);
    return module.exports[handlerName];
  },

  debugFuncP (event, context) {

    return Promise.resolve('nothing');
  },

  debugFuncCB (event, context) {
    console.error(util.inspect(event), util.inspect(context));
  },

  // just make sure everything is as it is expected to be. the agent
  // is not loaded so the user's function is not wrapped unless
  // autowrap is being used.
  agentNotLoadedP (event, context) {
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
  agentDisabledP (event, context) {
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
        console.log(JSON.stringify(output));
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

  agentEnabledP (event, context) {
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

  agentEnabledReturnValueP (event, context) {
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
