'use strict';

const base = process.env.AO_TEST_LAMBDA_APM || 'appoptics-apm';
const runtime = process.env.AO_TEST_LAMBDA_RUNTIME || '/var/runtime/UserFunction';
const ao = require(base);

const taskRoot = process.env.LAMBDA_TASK_ROOT || '';
const handler = process.env.APPOPTICS_LAMBDA_HANDLER || '';

// use the lambda runtime's loading logic
let load;
let userHandler;
try {
  ({load} = require(runtime));
  userHandler = load(taskRoot, handler);
} catch (e) {
  ao.loggers.error(`failed to load ${handler}`, e);
}

if (ao.cfg.enabled) {
  userHandler = ao.wrapLambdaHandler(userHandler);
}

module.exports = {
  handler: userHandler,
}
