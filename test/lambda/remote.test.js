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
const lambdaApmLayer = 'appoptics-apm-layer';
const xt = 'X-Trace';

let apmVersion;
let aobVersion;

const p1 = fsp.readFile('package.json', 'utf8')
  .then(text => {
    apmVersion = JSON.parse(text).version;
  });
const p2 = fsp.readFile('node_modules/appoptics-bindings/package.json')
  .then(text => {
    aobVersion = JSON.parse(text).version;
  });

describe('verify the lambda layer works', function () {
  before(function () {
    // wait for the io to complete
    return Promise.all([p1, p2]);
  });

  it('should be testing the same version on lambda', function () {
    this.timeout(10 * 60 * 1000);
    return awsUtil.getFunctionConfiguration(lambdaTestFunction)
      // find lambdaApmLayer
      .then(fnConfig => {
        if (!fnConfig.Layers) {
          throw new TypeError(`${fnConfig.FunctionName} has no layers`);
        }
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
      // make sure it matches the local versions
      .then(r => {
        return awsUtil.getLayerVersionByArn(r.layerArn)
          .then(layer => {
            const m = layer.Description.match(/^apm v(.+), bindings v(.+)$/);
            if (!m) {
              throw new Error('cannot find versions');
            }
            expect(apmVersion).equal(m[1]);
            expect(aobVersion).equal(m[2]);
            return r.fnConfig;
          });
      })
      // and double check by asking the function to return the versions too.
      .then(fnConfig => {
        const payload = JSON.stringify({cmds: ['versions', 'context']});
        return awsUtil.invoke(fnConfig.FunctionArn, payload)
          .then(r => {
            expect(r.Payload.body.response.versions.ao).equal(apmVersion);
            expect(r.Payload.body.response.versions.aob).equal(aobVersion);
            expect(r.Payload.body.response.context).an('object');
            return r.Payload.body.response;
          })
      })
      .then(response => {
        const {context, invocations} = response;
        const le = new LogEntries(context.awsRequestId, context.logGroupName, context.logStreamName);

        // wait up to 5 minutes for the logs to appear
        return le.waitUntilFind(5 * 60)
          .then(found => {
            expect(found.state).equal('done', `waitUntilFind returned state ${found.state}, expected done`);

            expect(found).property('aoData').exist.an('object', 'aoData object not found');
            expect(found.aoData).property('events').exist.an('array', 'aoData.events must be an array');
            expect(found.aoData).property('metrics').exist.an('array', 'aoData.metrics must be an array');

            const events = found.aoData.events;
            const metrics = found.aoData.metrics;

            return {events, metrics};
          })
          .then(results => {
            // if it just started then an init event was sent.
            const {events, metrics} = results;

            const expectedEvents = invocations.count === 1 ? 3 : 2;
            expect(events.length).equal(expectedEvents, `found ${events.length} events when expecting ${expectedEvents}`);

            let entryIx;
            for (let i = 0; i < events.length; i++) {
              if (expectedEvents === 3 && events[i].Layer === 'nodejs') {
                expect(events[i].Label).equal('single');
                expect(events[i]).property(xt).match(/2B[0-9A-F]{56}0(0|1)/);
                expect(events[i].__Init).equal(1);
                expect(events[i].TID).exist.a('number');
                expect(events[i].Timestamp_u).exist.a('number');
                expect(events[i].Hostname).exist.a('string');
                continue;
              }

              expect(events[i].Layer).equal('nodejs-lambda-userHandler');
              if (events[i].Label === 'entry') {
                expect(events[i].Spec).equal('lambda');
                expect(events[i]['X-Trace']).match(/2B[0-9A-F]{56}0(0|1)/);
                entryIx = i;

                expect(events[i].InvocationCount).gte(1);
                expect(events[i].FunctionName).equal(lambdaTestFunction);
                expect(events[i].FunctionVersion).equal('$LATEST');
                expect(events[i].SampleSource).equal(1);
                expect(events[i].SampleRate).equal(1000000);
                expect(events[i].TID).exist.a('number');
                expect(events[i].Timestamp_u).exist.a('number');
                expect(events[i].Hostname).exist.a('string');

              } else if (events[i].Label === 'exit') {
                expect(events[i]).property(xt).match(/2B[0-9A-F]{56}0(0|1)/);
                expect(events[i]).property('Edge').match(/[0-9A-F]{16}/);
                expect(events[i][xt].slice(0, 42)).equal(events[entryIx][xt].slice(0, 42), 'task IDs must match');
                expect(events[i].Edge).equal(events[entryIx][xt].slice(42, 58), 'edge must point to entry');
                expect(events[i]).property('TransactionName').a('string');

                expect(events[i].TID).exist.a('number');
                expect(events[i].Timestamp_u).exist.a('number');
                expect(events[i].Hostname).exist.a('string');
              } else {
                throw new TypeError(`unexpected event ${events[i].Layer}:${events[i].Label}`);
              }
            }

          })

      })

  });

  it('should fetch correctly work through the api gateway', function () {
    this.timeout(10 * 60 * 1000);

    // TODO BAM add cloudformation describe-stack-resource call to get api
    const apiid = 'gug4hbulf5';
    const region = awsUtil.AWS.config.region;
    const queryParams = '?context&event';
    const protocol = 'https';
    const host = `${apiid}.execute-api.${region}.amazonaws.com`;
    const target = `${host}/api`;
    const url = `${protocol}://${target}${queryParams}`;

    return axios.get(url)
      .then(response => {
        expect(response.status).equal(200, 'status should be 200');
        expect(response.headers).exist;
        expect(response.data).exist;

        expect(response.headers).property('x-trace').match(/2B[0-9A-F]{56}0(1|0)/);

        expect(response.data.response).exist;
        const data = response.data.response;

        expect(data.invocations).exist;
        expect(data.context).exist;
        expect(data.event).exist;

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
            const expectedEvents = r.invocations === 1 ? 3 : 2;
            expect(events.length).equal(expectedEvents, `found ${events.length} events when expecteding ${expectedEvents}`);

            let entryIx;

            for (let i = 0; i < events.length; i++) {
              if (expectedEvents === 3 && events[i].Layer === 'nodejs') {
                console.log(events[i]);
                expect(events[i].Label).equal('single');
                return;
              }

              expect(events[i].Layer).equal('nodejs-lambda-userHandler');
              if (events[i].Label === 'entry') {
                expect(events[i].Spec).equal('lambda');
                expect(events[i].Method).equal('GET');
                expect(events[i].URL).equal('/');
                expect(events[i].Proto).equal(protocol);
                expect(events[i]['HTTP-Host']).equal(host);
                expect(events[i].Port).oneOf([443, '443']);
                expect(events[i]['X-Trace']).match(/2B[0-9A-F]{56}0(0|1)/);
                entryIx = i;

                expect(events[i].FunctionName).equal(lambdaTestFunction);
                expect(events[i].FunctionVersion).equal('$LATEST');
                expect(events[i].SampleSource).equal(1);
                expect(events[i].SampleRate).equal(1000000);
                expect(events[i].TID).exist.a('number');
                expect(events[i].Timestamp_u).exist.a('number');
                expect(events[i].Hostname).exist.a('string');

              } else if (events[i].Label === 'exit') {
                expect(events[i]).property(xt).match(/2B[0-9A-F]{56}0(0|1)/);
                expect(events[i]).property('Edge').match(/[0-9A-F]{16}/);
                expect(events[i][xt].slice(0, 42)).equal(events[entryIx][xt].slice(0, 42), 'task IDs must match');
                expect(events[i].Edge).equal(events[entryIx][xt].slice(42, 58), 'edge must point to entry');
                expect(events[i]).property('TransactionName').a('string');

                expect(events[i].TID).exist.a('number');
                expect(events[i].Timestamp_u).exist.a('number');
                expect(events[i].Hostname).exist.a('string');
              } else {
                throw new TypeError(`unexpected event ${events[i].Layer}:${events[i].Label}`);
              }
            }


            expect(metrics.length).exist;

            ([] || metrics).forEach((m, ix) => {
              if (Array.isArray(m.measurements)) {
                const measurements = m.measurements;
                delete m.measurements;
                console.log(m, measurements);
              } else {
                console.log(`metric[${ix}]:`, m);
              }
            })

            // check found.entries[found.startIx] ?
            // check found.entries[found.endIx] ?
            // check found.entries[found.reportIx] ?
            return r;
          })

      });
  })
});


