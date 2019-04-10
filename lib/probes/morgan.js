'use strict'

const ao = require('..')
//const conf = ao.probes.hapi

const logMissing = ao.makeLogMissing('morgan');

//
// patch morgan so the logs can be mucked with
//
// morgan, compile, format, token
//
module.exports = function (morgan) {
  //const {version} = requirePatch.relativeRequire('morgan/package.json')
  let token

  const pmorgan = new Proxy(morgan, {
    // get a property of target
    //get (target, prop, receiver) {
    //  const name = typeof prop === 'symbol' ? prop.toString() : prop;
    //  console.log(`getting ${typeof prop}: ${name}`);
    //  const thing = Reflect.get(...arguments);
    //  if (prop === 'format') {
    //    // hack the format
    //  } else if (prop === 'compile') {
    //    // hack the format
    //  }
    //  return thing;
    //  //return Reflect.get(...arguments);
    //},
    //set (target, prop, value) {
    //  console.log(`setting ${prop}`);
    //  return Reflect.set(...arguments);
    //},
    // call target/morgan as a function
    apply (target, thisArg, argumentsList) {
      if (ao.cfg.insertTraceIdsIntoMorgan) {
        if (!token) {
          token = morgan.token('ao-trace-id', () => `ao.traceId=${ao.insertLogObject().ao.traceId}`);
        }
      }
      if (ao.cfg.insertTraceIdsIntoMorgan) {
        argumentsList = tryInsertion(morgan, argumentsList);
      }

      return Reflect.apply(morgan, thisArg, argumentsList);
    },
    // fetching the prototype?
    //getPrototypeOf (target) {
    //  console.log('getPrototypeOf()');
    //  return morgan.prototype;
    //}
  })

  return pmorgan;
}

// try to insert the trace ID.
function tryInsertion (morgan, args) {

  // the first argument can be a string name, a string format, or a custom format function.
  // it can also be an options argument (deprecated).
  // the following code is modeled directly after the morgan code to try to handle arguments
  // as correctly as possible.
  const [format, options] = args;
  let fmt = format;
  let opts = options || {};

  if (format && typeof format === 'object') {
    opts = format;
    fmt = opts.format || 'default';
  }

  if (fmt === undefined) {
    fmt = 'default';
  }

  if (typeof fmt === 'function') {
    // the caller is passing a custom format function
    const wrapped = function () {
      const string = fmt.apply(this, arguments);
      return `${string} ao.traceId=${ao.insertLogObject().ao.traceId}`;
    }
    args[0] = wrapped;
    args[1] = opts;
  } else if (fmt in morgan) {
    // the format exists in morgan. it's kind of fragile though, morgan stores all
    // tokens, formats, and it's own functions as properties on the morgan object so
    // the fmt name could exist yet not be a format. but that's the way it works. if
    // it's a function it could be a token, one of morgan's functions, or a compiled
    // format. either way, all that can be done here is to wrap it. this is particularly
    // true for the 'dev' format that is precompiled.
    let needsWrapped = true;
    if (typeof morgan[fmt] === 'function') {
      // dev is the only precompiled format so it's the only one that needs to be wrapped.
      if (fmt === 'dev' && needsWrapped) {
        const dev = morgan.dev;
        const wrapped = function () {
          const string = dev.apply(this, arguments);
          return `${string} ao.traceId=${ao.insertLogObject().ao.traceId}`;
        }
        morgan[fmt] = wrapped;
        args[0] = 'dev';
        args[1] = opts;
        needsWrapped = false;
      }
    } else if (typeof fmt === 'string') {
      // the format doesn't exist so this must be a format string or the property name for
      // one of morgan's predefined format strings. that's the way morgan is going to interpret
      // it regardless. that means that there is not going to be a referenceable function to
      // wrap so the only way to insert our trace ID is to modify the format string by adding
      // our token at the end. in this case modify the calling signature to the standard form
      // of morgan('format', options) not matter how it was originally called.
      if (typeof morgan[fmt] === 'string') {
        morgan[fmt] = `${morgan[fmt]} :ao-trace-id`;
      } else {
        // not sure we should do this. if the caller is supplying their own format they can
        // insert :ao-trace-id on their own. if they choose not to should we be inserting it?
        // TODO BAM note - this also applies to calling 'morgan.format' to define a format.
        //args[0] = `${fmt} ao.traceId=:ao-trace-id`;
        //args[1] = opts;
      }
    } else {
      logMissing(`expected fmt type (got ${typeof fmt})`);
    }
  }
  // return the possibly modified args.
  return args;
}
