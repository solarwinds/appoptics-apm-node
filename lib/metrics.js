'use strict';

const {loggers: log, addon: aob} = require('.');
const v8 = require('v8');

class Metrics {
  constructor (options = {}) {
    this.id = undefined;
    this.interval = options.interval || 60 * 1000;
    this.prefix = options.prefix || 'trace.node';
    this.metrics = [];
    this.gcTypeNames = {
      1: 'scavenge',
      2: 'markSweepCompact',
      4: 'incrementalMarking',
      8: 'processWeakCallbacks',
    };
  }

  start () {
    // start the metrics gathered by the C++ code
    aob.metrics.start();

    this.id = setInterval(() => {
      this.reportMetrics();
    }, this.interval);
    // don't let metrics keep the process alive
    this.id.unref();
  }

  stop () {
    aob.metrics.stop();
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
    this.addMetrics();
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

  addMetrics () {
    const metrics = aob.metrics.getMetrics();
    if (metrics.gc) {
      this.addMetricV('gc.gcCount', metrics.gc.gcCount);
      this.addMetricV('gc.gcTime', metrics.gc.gcTime);
      this.addMetricV('gc.p50', metrics.gc.p50);
      this.addMetricV('gc.p75', metrics.gc.p75);
      this.addMetricV('gc.p90', metrics.gc.p90);
      this.addMetricV('gc.p95', metrics.gc.p95);
      this.addMetricV('gc.p99', metrics.gc.p99);
      this.addMetricV('gc.min', metrics.gc.min);
      this.addMetricV('gc.max', metrics.gc.max);
      this.addMetricV('gc.mean', metrics.gc.mean);
      this.addMetricV('gc.stddev', metrics.gc.stddev);

      const types = Object.keys(metrics.gc.gcTypeCounts);
      for (let i = 0; i < types.length; i++) {
        const type = types[i];
        this.addMetricV(`gc.type.${this.gcTypeNames[type] || 'other'}`, metrics.gc.gcTypeCounts[type]);
      }
    }

    if (metrics.eventloop) {
      this.addMetricV('eventloop.p75', metrics.eventloop.p75);
      this.addMetricV('eventloop.p90', metrics.eventloop.p90);
      this.addMetricV('eventloop.p50', metrics.eventloop.p50);
      this.addMetricV('eventloop.p95', metrics.eventloop.p95);
      this.addMetricV('eventloop.p99', metrics.eventloop.p99);
      this.addMetricV('eventloop.min', metrics.eventloop.min);
      this.addMetricV('eventloop.max', metrics.eventloop.max);
      this.addMetricV('eventloop.mean', metrics.eventloop.mean);
      this.addMetricV('eventloop.stddev', metrics.eventloop.stddev);
    }

    let cpu = metrics.process;
    if (!cpu) {
      cpu = process.cpuUsage();
    }
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
