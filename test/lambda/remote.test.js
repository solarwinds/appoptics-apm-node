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
const cwl = awsUtil.cwl;

const lambdaTestFunction = 'nodejs-apig-function-9FHBV1SLUTCC';
const lambdaApmLayer = 'appoptics-apm-layer';

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
    this.timeout(5000);
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
        const payload = JSON.stringify({cmds: ['versions']});
        return awsUtil.invoke(fnConfig.FunctionArn, payload)
          .then(r => {
            expect(r.Payload.body.response.versions.ao).equal(apmVersion);
            expect(r.Payload.body.response.versions.aob).equal(aobVersion);
            return r;
          })
      })

  });

  it('should fetch correctly work through the api gateway', function () {
    this.timeout(10 * 60 * 1000);

    // TODO BAM add cloudformation describe-stack-resource call to get api
    const apiid = 'gug4hbulf5';
    const region = awsUtil.AWS.config.region;
    const queryParams = '?context&event';
    const url = `https://${apiid}.execute-api.${region}.amazonaws.com/api/${queryParams}`;

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
        console.log('n', r.invocations, 'rid', r.requestId);

        const le = new LogEntries(r.requestId, r.logGroupName, r.logStreamName);

        // look for
        // START RequestId: 85b7365d-08e8-4fa5-b1b8-5bdda5eac08b
        // ...
        // END RequestId: 85b7365d-08e8-4fa5-b1b8-5bdda5eac08b
        //
        // wait 5 minutes for the logs to appear
        return le.waitUntilFind(5 * 60)
          .then(r => {
            console.log(r.state);
            if (r.state === 'done') {
              console.log(r.entries[r.startIx]);
              for (let i = 0; i < r.aoIx.length; i++) {
                console.log(r.entries[r.aoIx[i]]);
              }
              console.log(r.entries[r.endIx]);
              if (r.reportIx) {
                console.log(r.entries[r.reportIx]);
              }
            }
            return r;
          })

      });
  })
});

class LogEntries {
  constructor (requestId, logGroupName, logStreamName) {
    this.requestId = requestId;
    this.logGroupName = logGroupName;
    this.logStreamName = logStreamName;
    this.state = 'find-start';
    this.startIx = undefined;
    this.aoIx = [];
    this.endIx = undefined;
    this.reportIx = undefined;
    this.startMarker = `START RequestId: ${requestId}`;
    this.endMarker = `END RequestId: ${requestId}`;
    this.reportMarker = `REPORT RequestId: ${requestId}`;
    this.entries = [];
  }

  find (newEntries, debug) {
    if (!Array.isArray(newEntries)) {
      throw new TypeError('newEntries must be an array');
    }
    if (debug) console.log('starting find, state =', this.state);
    for (let i = 0; i < newEntries.length; i++) {
      if (this.state === 'find-start') {
        if (newEntries[i].message.startsWith(this.startMarker)) {
          if (debug) console.log('found start, setting state = find-end');
          this.startIx = this.entries.length;
          this.entries.push(newEntries[i]);
          this.state = 'find-end';
        }
        continue;
      } else if (this.state === 'find-end') {
        this.entries.push(newEntries[i]);
        if (newEntries[i].message.startsWith('{"ao-data":')) {
          this.aoIx.push(this.entries.length - 1);
        } else if (newEntries[i].message.startsWith(this.endMarker)) {
          if (debug) console.log('found end, state = done');
          this.endIx = this.entries.length - 1;
          this.state = 'done';
          if (newEntries[i + 1].message.startsWith(this.reportMarker)) {
            this.reportIx = this.entries.length;
            this.entries.push(newEntries[i + 1]);
          }
        }
      }
      //
      if (this.state === 'done') {
        if (debug) console.log('state = done, exiting loop');
        break;
      }
    }

    return this.state;
  }

  async waitUntilFind (secondsToWait) {
    const endTime = Date.now() + secondsToWait * 1000;

    let r;
    while (Date.now() < endTime) {
      try {
        r = await this.getLogEvents();
        break;
      } catch (e) {
        if (e.code !== 'ResourceNotFoundException') {
          for (const k of ['message', 'code', 'statusCode', 'retryable', 'retryDelay']) {
            console.log(k, e[k]);
          }
          throw e;
        }
        console.log('waiting for log stream to show up');
        await pause(e.retryDelay || 1000);
      }
    }

    let {events, nextForwardToken} = r;
    let state = this.find(events);

    while (state !== 'done' && nextForwardToken && Date.now() < endTime) {
      console.log('pausing');
      await pause(2 * 1000);
      const r = await this.getLogEvents({nextToken: nextForwardToken});
      ({events, nextForwardToken} = r);
      state = this.find(events);
    }

    return {
      state,
      entries: this.entries,
      startIx: this.startIx,
      aoIx: this.aoIx,
      endIx: this.endIx,
      reportIx: this.reportIx
    };
  }

  async getLogEvents (options) {
    return new Promise((resolve, reject) => {
      const params = {
        logGroupName: this.logGroupName,
        logStreamName: this.logStreamName,
        startFromHead: true
      };
      Object.assign(params, options);
      cwl.getLogEvents(params, function (err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      })
    })
  }
}

async function pause (ms) {
  return new Promise(resolve => {
    setTimeout(function () {
      resolve();
    }, ms);
  })
}
