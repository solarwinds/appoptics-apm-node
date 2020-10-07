'use strict';

const nvm_dir = process.env.NVM_DIR;
const version = process.version;
const prefix = process.env.NODE_PATH ? ':' : '';
const globalInstalls = `${prefix}${nvm_dir}/versions/node/${version}/lib/node_modules`;
process.env.NODE_PATH += globalInstalls;


const fsp = require('fs').promises;

const axios = require('axios');
const expect = require('chai').expect;

const awsUtil = require('./aws-util.js');

const LogEntries = require('./log-entries');

const lambdaTestFunction = 'nodejs-apig-function-9FHBV1SLUTCC';
// allow testing against a different layer depending on what the lambdaTestFunction
// is configured with.
const lambdaApmLayer = process.env.AO_TEST_LAMBDA_LAYER_NAME || 'appoptics-node';
const xt = 'X-Trace';
const ignoreVersions = 'AO_TEST_LAMBDA_IGNORE_VERSIONS' in process.env;

let apmVersion;
let aobVersion;

let functionArn;
let fnConfig;
let fnInvocations;
let initEvent;

describe('verify the lambda layer works', function () {
  before(function () {
    if (process.env.AO_TEST_LAMBDA_LOCAL_VERSIONS) {
      const versions = process.env.AO_TEST_LAMBDA_LOCAL_VERSIONS;
      const m = versions.match(/^apm v(.+), bindings v(.+)/);
      expect(m, 'AO_TEST_LAMBDA_LOCAL_VERSIONS must match /^apm v(.+), bindings v(.+)/').exist;
      ({1: apmVersion, 2: aobVersion} = m);
      return;
    }
    const p1 = fsp.readFile('package.json', 'utf8')
      .then(text => {
        apmVersion = JSON.parse(text).version;
      });
    const p2 = fsp.readFile('node_modules/appoptics-bindings/package.json')
      .then(text => {
        aobVersion = JSON.parse(text).version;
      });
    // wait for the io to complete
    return Promise.all([p1, p2]);
  });

  it('should be testing a compatible layer on lambda', function () {
    this.timeout(10 * 60 * 1000);
    return awsUtil.getFunctionConfiguration(lambdaTestFunction)
      // find lambdaApmLayer
      .then(fnConfig => {
        if (!fnConfig.Layers) {
          throw new TypeError(`${fnConfig.FunctionName} has no layers or FunctionArn`);
        }
        functionArn = fnConfig.FunctionArn;
        const re = new RegExp(`${lambdaApmLayer}:([0-9]+)$`);
        let m;
        let arn;
        for (let i = 0; i < fnConfig.Layers.length; i++) {
          m = fnConfig.Layers[i].Arn.match(re)
          if (m) {
            arn = fnConfig.Layers[i].Arn;
            break;
          }
        }
        if (!m) {
          throw new TypeError(`${fnConfig.FunctionName} does not use ${lambdaApmLayer}`);
        }
        return {fnConfig, layerArn: arn, layerVersion: m[1]};
      })
      // make sure it matches the local versions or was overridden.
      .then(r => {
        return awsUtil.getLayerVersionByArn(r.layerArn)
          .then(layer => {
            const m = layer.Description.match(/^apm v(.+), bindings v(.+), auto v(.+)$/);
            if (!m) {
              throw new Error('cannot find versions');
            }
            const {1: remoteApm, 2: remoteAob} = m;
            fnConfig = r.fnConfig;
            if (!ignoreVersions) {
              expect(apmVersion).equal(remoteApm, `local ${apmVersion} must match remote ${remoteApm}`);
              expect(aobVersion).equal(remoteAob, `local ${aobVersion} must match remote ${remoteAob}`);
            }
            return fnConfig;
          });
      });
  });

  it('should invoke the function, double check the version, and check logs', function () {
    this.timeout(10 * 60 * 1000);
    // and double check by asking the function to return the versions too.
    const payload = JSON.stringify({cmds: ['versions', 'context']});
    return awsUtil.invoke(fnConfig.FunctionArn, payload)
      .then(r => {
        expect(r).property('Payload').property('body').property('response').property('versions');
        if (!ignoreVersions) {
          expect(r.Payload.body.response.versions.ao).equal(apmVersion);
          expect(r.Payload.body.response.versions.aob).equal(aobVersion);
        }
        expect(r.Payload.body.response).property('context').an('object');
        return r.Payload.body.response;
      })
      .then(response => {
        const {context, invocations} = response;
        const le = new LogEntries(context.awsRequestId, context.logGroupName, context.logStreamName);

        // wait up to 5 minutes for the logs to appear
        return le.waitUntilFind(5 * 60)
          .then(found => {
            expect(found.state).equal('done', `waitUntilFind() returned state ${found.state}, expected done`);

            expect(found).property('aoData').exist.an('object', 'aoData object not found');
            expect(found.aoData).property('events').exist.an('array', 'aoData.events must be an array');
            expect(found.aoData).property('metrics').exist.an('array', 'aoData.metrics must be an array');

            const events = found.aoData.events;
            const metrics = found.aoData.metrics;

            return {events, metrics};
          })
          .then(results => {
            const {events, metrics} = results;

            // if it just started then an init event was sent.
            const expected = invocations.count === 1 ? 3 : 2;
            expect(events.length).equal(expected, `found ${events.length} events when expecting ${expected}`);


            fnInvocations = invocations.count;

            let entryIx;
            for (let i = 0; i < events.length; i++) {
              if (expected === 3 && events[i].Layer === 'nodejs') {
                initEvent = events[i];
                continue;
              }

              expect(events[i].Layer).equal('nodejs-lambda-userHandler');

              if (events[i].Label === 'entry') {
                entryIx = i;
                checkLambdaEntry(events[i], 'invoke');
              } else if (events[i].Label === 'exit') {
                checkLambdaExit(events[i], events[entryIx]);
              } else {
                throw new TypeError(`unexpected event ${events[i].Layer}:${events[i].Label}`);
              }
            }

            expect(metrics.length).gte(1);
          });

      });
  });

  it('should test the init event if this was the first invocation', function () {
    if (fnInvocations !== 1) {
      this.skip();
    }
    expect(initEvent).property('Label', 'single');
    checkInit(initEvent);
  })

  it('should fetch correctly through the api gateway', function () {
    this.timeout(10 * 60 * 1000);

    // TODO BAM add cloudformation describe-stack-resource call to get api
    const apiid = 'gug4hbulf5';
    const region = awsUtil.AWS.config.region;
    const queryParams = '?context&event&versions';
    const protocol = 'https';
    const host = `${apiid}.execute-api.${region}.amazonaws.com`;
    // use /latest to avoid specific function version bound to the /api endpoint.
    const stage = '/api';
    const httpPath = '/latest';
    const target = `${host}${stage}${httpPath}`;
    const url = `${protocol}://${target}${queryParams}`;
    const options = {apiid, region, queryParams, protocol, host, stage, httpPath, target, url};

    return axios.get(url)
      .then(response => {
        expect(response.status).equal(200, 'status should be 200');
        expect(response.headers).exist;
        expect(response.data).exist;

        //expect(response.headers).property('x-trace').match(/2B[0-9A-F]{56}0(1|0)/);

        expect(response.data).property('response').an('object');
        const data = response.data.response;

        expect(data.invocations).an('object');
        expect(data.context).an('object');
        expect(data.event).an('object');
        // the api gateway can be bound to a specific version
        expect(data.versions).an('object');
        if (!ignoreVersions) {
          expect(data.versions).property('ao', apmVersion, 'agent version must match');
          expect(data.versions).property('aob', aobVersion, 'bindings version must match');
        }

        expect(data.invocations).property('count').gte(1);
        const invocations = data.invocations.count;

        expect(data.context).property('logGroupName').a('string');
        expect(data.context).property('logStreamName').a('string');
        expect(data.context).property('awsRequestId').a('string');
        const logGroupName = data.context.logGroupName;
        const logStreamName = data.context.logStreamName;
        const requestId = data.context.awsRequestId;

        return {
          'x-trace': response.headers['x-trace'],
          logGroupName,
          logStreamName,
          requestId,
          invocations,
          options,
        };
      })
      .then(r => {
        const le = new LogEntries(r.requestId, r.logGroupName, r.logStreamName);

        // wait up to 5 minutes for the logs to appear
        return le.waitUntilFind(5 * 60)
          .then(found => {
            expect(found.state).equal('done', `waitUntilFind returned state ${found.state}, expected done`);

            expect(found).property('aoData').exist.an('object', 'aoData object not found');
            expect(found.aoData).property('events').exist.an('array', 'aoData.events must be an array');
            expect(found.aoData).property('metrics').exist.an('array', 'aoData.metrics must be an array');

            const events = found.aoData.events;
            const metrics = found.aoData.metrics;

            // if it just started then an init event was sent.
            const expected = r.invocations === 1 ? 3 : 2;
            expect(events.length).equal(expected, `found ${events.length} events when expecteding ${expected}`);

            let entryIx;

            for (let i = 0; i < events.length; i++) {
              if (expected === 3 && events[i].Layer === 'nodejs') {
                expect(events[i].Label).equal('single');
                checkInit(events[i]);
                return;
              }

              expect(events[i].Layer).equal('nodejs-lambda-userHandler');
              if (events[i].Label === 'entry') {
                checkLambdaEntry(events[i], 'apig', r.options);
                // check for additional api gateway kv pairs
                expect(events[i].HTTPMethod).equal('GET');
                //expect(events[i].URL).equal(httpPath);
                expect(events[i]).property('URL', httpPath);
                expect(events[i]).property('Forwarded-Proto', protocol);
                expect(events[i]).property('Forwarded-Port').oneOf([443, '443']);
                expect(events[i]).property('Forwarded-For').match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
                expect(events[i]).property('HTTP-Host', host);
                entryIx = i;

              } else if (events[i].Label === 'exit') {
                checkLambdaExit(events[i], events[entryIx]);

              } else {
                throw new TypeError(`unexpected event ${events[i].Layer}:${events[i].Label}`);
              }
            }


            expect(metrics.length).exist;

            ([] || metrics).forEach((m, ix) => {
              if (Array.isArray(m.measurements)) {
                const measurements = m.measurements;
                delete m.measurements;
                // eslint-disable-next-line no-console
                console.log(m, measurements);
              } else {
                // eslint-disable-next-line no-console
                console.log(`metric[${ix}]:`, m);
              }
            })

            // check found.entries[found.startIx] ?
            // check found.entries[found.endIx] ?
            // check found.entries[found.reportIx] ?
            return r;
          })

      });
  });
});

function checkInit (event) {
  expect(event).property(xt).match(/2B[0-9A-F]{56}0(0|1)/);
  expect(event).property('__Init').equal(1);

  expect(event).property('TID').a('number');
  expect(event).property('Timestamp_u').a('number');
  expect(event).property('Hostname').a('string');
}

function checkLambdaEntry (event, invocationType, options) {
  expect(invocationType).oneOf(['apig', 'invoke']);
  if (invocationType === 'apig') {
    expect(event).property('Spec').equal('aws-lambda:ws');
  } else if (invocationType === 'invoke') {
    expect(event).property('Spec').equal('aws-lambda');
  }
  expect(event).property(xt).match(/2B[0-9A-F]{56}0(0|1)/);
  expect(event).property('InvocationCount').gte(1);
  expect(event).property('InvokedFunctionARN', functionArn);
  expect(event).property('FunctionVersion').equal('$LATEST');
  expect(event).property('SampleSource').equal(1);
  expect(event).property('SampleRate').equal(1000000);

  expect(event).property('TID').a('number');
  expect(event).property('Timestamp_u').a('number');
  if (invocationType === 'apig') {
    expect(event).property('HTTP-Host', options.host);
    expect(event).property('Hostname').match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
  }
}

function checkLambdaExit (event, entry, apig) {
  expect(event).property('Edge').match(/[0-9A-F]{16}/);
  expect(event[xt].slice(0, 42)).equal(entry[xt].slice(0, 42), 'task IDs must match');
  expect(event).property('Edge').equal(entry[xt].slice(42, 58), 'edge must point to entry');
  expect(event).property('TransactionName').a('string');

  expect(event).property('TID').a('number');
  expect(event).property('Timestamp_u').a('number');
  if (apig) {
    expect(event).property('Hostname').a('string');
  }
}
