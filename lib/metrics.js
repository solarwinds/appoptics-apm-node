'use strict';

const {loggers: log, addon: aob} = require('.');
const v8 = require('v8');

class Metrics {
  constructor (options = {}) {
    this.id = undefined;
    this.interval = options.interval || 60 * 1000;
    this.prefix = options.prefix || 'trace.node';
    this.metrics = [];
  }

  start () {
    this.id = setInterval(() => {
      this.reportMetrics();
    }, this.interval);
    // don't let metrics keep the process alive
    this.id.unref();
  }

  stop () {
    clearInterval(this.id);
  }

  resetInterval (interval) {
    this.interval = interval;
    this.stop();
    this.start();
  }

  addMetricV (metric, value, n = 1) {
    this.metrics.push({
      name: `${this.prefix}.${metric}`,
      count: n,
      value
    });
  }

  addMetricI (metric, n = 1) {
    this.metrics.push({
      name: `${this.prefix}.${metric}`,
      count: n
    });
  }

  reportMetrics () {
    this.addCpu();
    this.addMemory();
    const r = aob.Reporter.sendMetrics(this.metrics);
    if (r.errors.length > 0) {
      r.errors.forEach(e => {
        log.error('invalid metric', e);
      });
    }
    // don't keep the previous metrics around
    this.metrics.length = 0;
  }

  addCpu () {
    const cpu = process.cpuUsage();
    this.addMetricV('process.cpuUsage.user', cpu.user);
    this.addMetricV('process.cpuUsage.system', cpu.system);
  }

  addMemory () {
    let mem = process.memoryUsage();
    this.addMetricV('process.memoryUsage.rss', mem.rss);
    this.addMetricV('process.memoryUsage.heapTotal', mem.heapTotal);
    this.addMetricV('process.memoryUsage.heapUsed', mem.heapUsed);
    this.addMetricV('process.memoryUsage.external', mem.external);

    mem = v8.getHeapStatistics();
    this.addMetricV('v8.getHeapStatistics.total_heap_size', mem.total_heap_size);
    this.addMetricV('v8.getHeapStatistics.total_heap_size_executable', mem.total_heap_size_executable);
    this.addMetricV('v8.getHeapStatistics.total_physical_size', mem.total_physical_size);
    this.addMetricV('v8.getHeapStatistics.total_available_size', mem.total_available_size);
    this.addMetricV('v8.getHeapStatistics.used_heap_size', mem.used_heap_size);
    this.addMetricV('v8.getHeapStatistics.heap_size_limit', mem.heap_size_limit);
    this.addMetricV('v8.getHeapStatistics.malloced_memory', mem.malloced_memory);
    this.addMetricV('v8.getHeapStatistics.peak_malloced_memory', mem.peak_malloced_memory);
  }
}

module.exports = Metrics;
