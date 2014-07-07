#include "node-oboe.h"

/**
 * Set the tracing mode.
 *
 * @param newMode One of
 * - OBOE_TRACE_NEVER(0) to disable tracing,
 * - OBOE_TRACE_ALWAYS(1) to start a new trace if needed, or
 * - OBOE_TRACE_THROUGH(2) to only add to an existing trace.
 */
// TODO: Make this fail on inputs not in 0, 1, 2
NAN_METHOD(OboeContext::setTracingMode) {
  NanScope();

  // Validate arguments
  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsNumber()) {
    return NanThrowError("Tracing mode must be a number");
  }

  int mode = args[0]->NumberValue();
  if (mode < 0 || mode > 2) {
    return NanThrowError("Invalid tracing mode");
  }

  oboe_settings_cfg_tracing_mode_set(mode);

  NanReturnUndefined();
}

/**
 * Set the default sample rate.
 *
 * This rate is used until overridden by the TraceView servers.  If not set then the
 * value 300,000 will be used (ie. 30%).
 *
 * The rate is interpreted as a ratio out of OBOE_SAMPLE_RESOLUTION (currently 1,000,000).
 *
 * @param newRate A number between 0 (none) and OBOE_SAMPLE_RESOLUTION (a million)
 */
// TODO: Make this fail on values that exceed OBOE_SAMPLE_RESOLUTION
NAN_METHOD(OboeContext::setDefaultSampleRate) {
  NanScope();

  // Validate arguments
  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsNumber()) {
    return NanThrowError("Sample rate must be a number");
  }

  int rate = args[0]->NumberValue();
  if (rate < 1 || rate > OBOE_SAMPLE_RESOLUTION) {
    return NanThrowError("Sample rate out of range");
  }

  oboe_settings_cfg_sample_rate_set(rate);

  NanReturnUndefined();
}

/**
 * Check if the current request should be traced based on the current settings.
 *
 * If xtrace is empty, or if it is identified as a foreign (ie. cross customer)
 * trace, then sampling will be considered as a new trace.
 * Otherwise sampling will be considered as adding to the current trace.
 * Different layers may have special rules.  Also special rules for AppView
 * Web synthetic traces apply if in_tv_meta is given a non-empty string.
 *
 * This is designed to be called once per layer per request.
 *
 * @param layer Name of the layer being considered for tracing
 * @param in_xtrace Incoming X-Trace ID (NULL or empty string if not present)
 * @param in_tv_meta AppView Web ID from X-TV-Meta HTTP header or higher layer (NULL or empty string if not present).
 * @return Zero to not trace; otherwise return the sample rate used in the low order
 *         bytes 0 to 2 and the sample source in the higher-order byte 3.
 */
// TODO: Figure out how to catch and throw "liboboe: Error loading /var/lib/tracelyzer/settings" message
NAN_METHOD(OboeContext::sampleRequest) {
  NanScope();

  // Validate arguments
  if (args.Length() < 1) {
    return NanThrowError("Wrong number of arguments");
  }

  char* layer_name;
  char* in_xtrace;
  char* in_tv_meta;

  // The first argument must be a string
  if (!args[0]->IsString()) {
    return NanThrowError("Layer name must be a string");
  }
  String::Utf8Value layer_name_v8(args[0]);
  layer_name = *layer_name_v8;

  // If the second argument is present, it must be a string
  if (args.Length() >= 2) {
    if ( ! args[1]->IsString()) {
      return NanThrowError("X-Trace ID must be a string");
    }
    String::Utf8Value in_xtrace_v8(args[1]);
    in_xtrace = *in_xtrace_v8;
  } else {
    in_xtrace = *"";
  }

  // If the third argument is present, it must be a string
  if (args.Length() >= 3) {
    if ( ! args[2]->IsString()) {
      return NanThrowError("AppView Web ID must be a string");
    }
    String::Utf8Value in_tv_meta_v8(args[2]);
    in_tv_meta = *in_tv_meta_v8;
  } else {
    in_tv_meta = *"";
  }

  printf("attempting to sample %s %s %s\n", layer_name, in_xtrace, in_tv_meta);

  int sample_rate = 0;
  int sample_source = 0;
  int rc = oboe_sample_layer(
    layer_name,
    in_xtrace,
    in_tv_meta,
    &sample_rate,
    &sample_source
  );

  printf("sample result is %d %d %d\n", rc, sample_source, sample_rate);

  // Store rc, sample_source and sample_rate in an array
  Handle<Array> array = NanNew<Array>(2);
  array->Set(0, NanNew<Number>(rc));
  array->Set(1, NanNew<Number>(sample_source));
  array->Set(2, NanNew<Number>(sample_rate));

  NanReturnValue(array);
}

// returns pointer to current context (from thread-local storage)
oboe_metadata_t* OboeContext::get() {
  return oboe_context_get();
}

NAN_METHOD(OboeContext::toString) {
  NanScope();

  char buf[OBOE_MAX_METADATA_PACK_LEN];

  oboe_metadata_t *md = OboeContext::get();
  int rc = oboe_metadata_tostr(md, buf, sizeof(buf) - 1);
  if (rc == 0) {
    NanReturnValue(NanNew<String>(buf));
  } else {
    NanReturnEmptyString();
  }
}

NAN_METHOD(OboeContext::set) {
  NanScope();

  // Validate arguments
  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsObject() && !args[0]->IsString()) {
    return NanThrowError("You must supply a Metadata instance or string");
  }

  if (args[0]->IsObject()) {
    // Unwrap metadata instance from arguments
    Metadata* metadata = node::ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());

    // Set the context data from the metadata instance
    oboe_context_set(&metadata->metadata);
  } else {
    // Get string data from arguments
    String::Utf8Value v8_val(args[0]);
    std::string val(*v8_val);

    // Set the context data from the converted string
    oboe_context_set_fromstr(val.data(), val.size());
  }

  NanReturnUndefined();
}

NAN_METHOD(OboeContext::copy) {
  NanScope();

  // Make an empty object template with space for internal field pointers
  Handle<ObjectTemplate> t = NanNew<ObjectTemplate>();
  t->SetInternalFieldCount(2);

  // Construct an object with our internal field pointer
  Local<Object> obj = t->NewInstance();

  // Attach the internal field pointer
  NanSetInternalFieldPointer(obj, 1, OboeContext::get());

  // Use the object as an argument in the event constructor
  Handle<Value> argv[1] = { obj };
  NanReturnValue(NanNew(Metadata::constructor)->GetFunction()->NewInstance(1, argv));
}

NAN_METHOD(OboeContext::clear) {
  NanScope();
  oboe_context_clear();
  NanReturnUndefined();
}

NAN_METHOD(OboeContext::isValid) {
  NanScope();

  NanReturnValue(NanNew<Boolean>(oboe_context_is_valid()));
}

NAN_METHOD(OboeContext::init) {
  NanScope();
  oboe_init();
  NanReturnUndefined();
}

NAN_METHOD(OboeContext::createEvent) {
  NanScope();

  // Make an empty object template with space for internal field pointers
  Handle<ObjectTemplate> t = NanNew<ObjectTemplate>();
  t->SetInternalFieldCount(2);

  // Construct an object with our internal field pointer
  Local<Object> obj = t->NewInstance();

  // Attach the internal field pointer
  NanSetInternalFieldPointer(obj, 1, OboeContext::get());

  // Use the object as an argument in the event constructor
  Handle<Value> argv[1] = { obj };
  NanReturnValue(NanNew(Event::constructor)->GetFunction()->NewInstance(1, argv));
}

NAN_METHOD(OboeContext::startTrace) {
  NanScope();

  oboe_metadata_t* md = OboeContext::get();
  oboe_metadata_random(md);

  Handle<Value> argv[0] = {};
  NanReturnValue(NanNew(Event::constructor)->GetFunction()->NewInstance(0, argv));
}

void OboeContext::Init(Handle<Object> module) {
  NanScope();

  Local<Object> exports = NanNew<Object>();
  NODE_SET_METHOD(exports, "setTracingMode", OboeContext::setTracingMode);
  NODE_SET_METHOD(exports, "setDefaultSampleRate", OboeContext::setDefaultSampleRate);
  NODE_SET_METHOD(exports, "sampleRequest", OboeContext::sampleRequest);
  NODE_SET_METHOD(exports, "toString", OboeContext::toString);
  NODE_SET_METHOD(exports, "set", OboeContext::set);
  NODE_SET_METHOD(exports, "copy", OboeContext::copy);
  NODE_SET_METHOD(exports, "clear", OboeContext::clear);
  NODE_SET_METHOD(exports, "isValid", OboeContext::isValid);
  NODE_SET_METHOD(exports, "init", OboeContext::init);
  NODE_SET_METHOD(exports, "createEvent", OboeContext::createEvent);
  NODE_SET_METHOD(exports, "startTrace", OboeContext::startTrace);

  module->Set(NanNew<String>("Context"), exports);
}
