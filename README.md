# nodoboe

Node.js instrumentation for TraceView

## Dependencies

- Linux
- node.js v0.10+
- liboboe installed at standard lib path

## Installation

The installation process is handled by npm and node-gyp. All you need to do is;

```
npm install
```

## Testing

Tests are written using [http://npmjs.org/package/mocha](mocha), and can be
found in the `test` folder. To run them, do this;

```
npm test
```

#### Coverage reports

I've included test coverage reporting. You can get a summary by running;

```
npm run coverage:report
```

For a more in-depth view that shows the code and what lines are reached try;

```
npm run coverage:html
```

## Auto Documentation

I've also included some basic automated documentation. To generate and view
them, do `npm run docs`.
