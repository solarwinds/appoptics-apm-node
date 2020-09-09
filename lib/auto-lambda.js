'use strict';

const ao = require('appoptics-apm');

const taskRoot = process.env.LAMBDA_TASK_ROOT || '';
const handler = process.env.APPOPTICS_LAMBDA_HANDLER || '';

// use the lambda runtime's loading logic
let load;
let userHandler;
try {
  ({load} = require('/var/runtime/UserFunction'));
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
