'use strict'

const probe = require('../amqplib')

module.exports = function (amqplib, options) {
  options.amqplib = {callbacks: true};
  return probe(amqplib, options);
}
