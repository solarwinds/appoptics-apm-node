# AWS Lambda-specific configuration

This covers how to configure and enable AppOptics APM for nodejs lambda functions. For
general configuration options see `configuration.md` in the same directory.

## Prerequisite

Add the `appoptics-apm-layer` to your function
- screen shots?
- select `arn:aws:lambda:${your-function's-region}:858939916050:layer:appoptics-apm-layer`:41
- forwarder setup already done (where to document this - each agent?)

choose `Specify an ARN` and select `....` - how to find/see available `appoptics-apm-layer`
versions for node? where to see?

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
- wrap your function before exporting it.

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
const ao = require('appoptics-apm');     // require the agent - contained in appoptics-apm-layer

async function myHandlerEvent (event, context) {
  return {statusCode: 200, body: JSON.stringify(event)};
}

// wrap user handler and export the wrapped function.
module.exports.handler = ao.wrapLambdaHandler(myHandlerEchoEvent);
```

## even more manual installation
- create your own layer that includes the appoptics-apm-code? this is complicated as it involves
building the bindings agent in an amazon linux container. punt.

## fine tuning

- it is possible to adjust the sample rate but requires tweaking internal settings and taking
the lambda function configuration and the expected loads into consideration. please contact
customer support in order to adjust the sample rate.




