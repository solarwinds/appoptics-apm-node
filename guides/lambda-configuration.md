# AWS Lambda-specific configuration

This covers how to configure and enable AppOptics APM for nodejs lambda functions. For
general configuration options see `configuration.md` in the same directory.

## Prerequisites

If you haven't already, set up the forwarder. This only needs to be done once per region
for the account.

Add the `appoptics-node` layer to your function
- find the current version for your region(s) at https://files.appoptics.com/lambda-layers/node/
- copy the arn (e.g., `arn:aws:lambda:us-east-1:085151004374:layer:appoptics-node:7`)

Add the `appoptics-node` layer to your function using one of the following methods
- use the AWS web console to add a layer to your function, choose specify an ARN, and paste the arn
copied above.
- use the AWS CLI to execute `aws lambda update-function-configuration`
- use the AWS SDK to invoke the update-function-configuration equivalent.

## no-code change instrumentation
- add the environment variable `APPOPTICS_WRAP_LAMBDA_HANDLER` set to the function's current handler.
The current handler can be found in the function's `Basic Settings` `Handler` setting, e.g.,
`index.handler`.
- change the function's `Basic Settings` `Handler` setting to `appoptics-auto-lambda.handler`.

That's it! When lambda loads the function it will invoke AppOptics' handler which will load your function
(specified by the env var `APPOPTICS_WRAP_LAMBDA_HANDLER`) and automatically set up your function's instrumentation.

## manual instrumentation
- DO NOT change the lambda function's `Handler` setting nor create the env var `APPOPTICS_WRAP_LAMBDA_HANDLER`
- add `const ao = require('appoptics-apm');` as the first module required in your function's code.
- use `ao.wrapLambdaHandler()` to wrap your function before exporting it.

for example, the lambda function's `Basic Settings` `Handler` is `index.handler` and your current code
is in the file `index.js` and looks like:

```js

async function myHandlerEchoEvent (event, context) {
  return {statusCode: 200, body: JSON.stringify(event)};
}

module.exports.handler = myHandlerEchoEvent;
```

to instrument make the following changes:

```js
// require the agent - contained in appoptics-node layer
const ao = require('appoptics-apm');

async function myHandlerEvent (event, context) {
  return {statusCode: 200, body: JSON.stringify(event)};
}

// wrap user handler and export the wrapped function.
module.exports.handler = ao.wrapLambdaHandler(myHandlerEchoEvent);
```

## fine tuning
- it is possible to adjust the sample rate but requires tweaking internal settings and taking
the lambda function configuration and the expected loads into consideration. please contact
customer support in order to adjust the sample rate.




