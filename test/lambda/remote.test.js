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
});
