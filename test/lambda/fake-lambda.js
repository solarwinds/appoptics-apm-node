'use strict';

// this section can be used for testing to allow node to find globally installed packages
// when requiring.
//const nvm_dir = process.env.NVM_DIR;
//const version = process.version;
//const prefix = process.env.NODE_PATH ? ':' : '';
//const globalInstalls = `${prefix}${nvm_dir}/versions/node/${version}/lib/node_modules`;
//process.env.NODE_PATH += globalInstalls;

const env = process.env;
const ne = env.NODE_ENV ? env.NODE_ENV.toLowerCase() : 'development';
if ('AWS_LAMBDA_FUNCTION_NAME' in env && 'LAMBDA_TASK_ROOT' in env) {
  return {type: 'serverless', id: 'lambda', nodeEnv: ne};
}

const ao = require('../..');

async function pseudoLambdaHandler (event, context) {
  return formatResponse({});
}

const wrappedHandler = ao.wrapLambdaHandler(pseudoLambdaHandler);

function formatResponse (body) {
  const response = {
    'statusCode': 200,
    'headers': {
      'Content-Type': 'application/json'
    },
    'isBase64Encoded': false,
    //'multiValueHeaders': {
    //  'X-Custom-Header': ['My value', 'My other value'],
    //},
    'body': body
  }
  return response
}

function fakeInvoke () {
  let result;
  pseudoLambdaHandler({}, {requestId: 'fake-string'})
    .then(r => {
      result = r;
      debugger;
    })
    .catch(e => {
      result = e;
      debugger;
    })
}

function fakeInvokeWrapped () {
  let result;
  wrappedHandler({}, {requestId: 'fake-string'})
    .then(r => {
      result = r;
      debugger;
    })
    .catch(e => {
      result = e;
      debugger;
    })
}

module.exports = {
  pseudoLambdaHandler,
  wrappedHandler,
  fakeInvoke,
  fakeInvokeWrapped,
};

debugger
