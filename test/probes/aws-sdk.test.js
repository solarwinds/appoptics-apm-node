'use strict'

const {ao} = require('../1.test-common.js'); // eslint-disable-line
const expect = require('chai').expect

const aws = require('aws-sdk')
const pkg = require('aws-sdk/package')

describe(`probes/aws-sdk ${pkg.version}`, function () {
  it('should have included \'x-trace\' in unsignableHeaders', function () {
    expect(aws.Signers.V4.prototype).property('unsignableHeaders')
    expect(aws.Signers.V4.prototype.unsignableHeaders).include('x-trace')
  })
})
