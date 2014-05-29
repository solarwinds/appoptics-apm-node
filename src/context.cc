#include "node-oboe.h"

/**
 * Set the tracing mode.
 *
 * @param newMode One of
 * - OBOE_TRACE_NEVER(0) to disable tracing,
 * - OBOE_TRACE_ALWAYS(1) to start a new trace if needed, or
 * - OBOE_TRACE_THROUGH(2) to only add to an existing trace.
 */
NAN_METHOD(OboeContext::setTracingMode) {
  NanScope();

  // Validate arguments
  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsNumber()) {
    return NanThrowError("Mode must be a number");
  }

  oboe_settings_cfg_tracing_mode_set(args[0]->NumberValue());

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
NAN_METHOD(OboeContext::setDefaultSampleRate) {
  NanScope();

  // Validate arguments
  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsNumber()) {
    return NanThrowError("Mode must be a number");
  }

  oboe_settings_cfg_sample_rate_set(args[0]->NumberValue());

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
NAN_METHOD(OboeContext::sampleRequest) {
  NanScope();

  // Validate arguments
  if (args.Length() != 3) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsString()) {
    return NanThrowError("Layer name must be a string");
  }
  if (!args[1]->IsString()) {
    return NanThrowError("X-Trace ID must be a string");
  }
  if (!args[2]->IsString()) {
    return NanThrowError("AppView Web ID must be a string");
  }

  int sample_rate = 0;
  int sample_source = 0;
  int rc = oboe_sample_layer(
    *String::Utf8Value(args[0]),
    *String::Utf8Value(args[1]),
    *String::Utf8Value(args[2]),
    &sample_rate,
    &sample_source
  );

  int res = 0;
  if (rc != 0) {
    res = ((sample_source & 0xFF) << 24) | (sample_rate & 0xFFFFFF);
  }

  NanReturnValue(NanNew<Number>(res));
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
  if (!args[0]->IsObject()) {
    return NanThrowError("You must supply a Metadata instance");
  }

  // Unwrap metadata instance from arguments
  Metadata* metadata = node::ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());

  oboe_context_set(&metadata->metadata);

  NanReturnUndefined();
}

NAN_METHOD(OboeContext::fromString) {
  NanScope();

  // Validate arguments
  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsString()) {
    return NanThrowTypeError("You must supply a string");
  }

  // Get string data from arguments
  std::string val(*String::Utf8Value(args[0]));

  // Set the context data from the converted string
  oboe_context_set_fromstr(val.data(), val.size());

  NanReturnUndefined();
}

NAN_METHOD(OboeContext::copy) {
  NanScope();

  Metadata* metadata = new Metadata(OboeContext::get());
  Local<Object> handle;
  metadata->Wrap(handle);

  NanReturnValue(handle);
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

  Event* event = new Event(OboeContext::get());
  Local<Object> handle;
  event->Wrap(handle);

  NanReturnValue(handle);
}

NAN_METHOD(OboeContext::startTrace) {
  NanScope();

  oboe_metadata_t* md = OboeContext::get();
  oboe_metadata_random(md);

  Event* event = new Event();
  Local<Object> handle;
  event->Wrap(handle);

  NanReturnValue(handle);
}

void OboeContext::Init(Handle<Object> module) {
  NanScope();

  Local<Object> exports = NanNew<Object>();
  NODE_SET_METHOD(exports, "setTracingMode", OboeContext::setTracingMode);
  NODE_SET_METHOD(exports, "setDefaultSampleRate", OboeContext::setDefaultSampleRate);
  NODE_SET_METHOD(exports, "sampleRequest", OboeContext::sampleRequest);
  NODE_SET_METHOD(exports, "toString", OboeContext::toString);
  NODE_SET_METHOD(exports, "set", OboeContext::set);
  NODE_SET_METHOD(exports, "fromString", OboeContext::fromString);
  NODE_SET_METHOD(exports, "copy", OboeContext::copy);
  NODE_SET_METHOD(exports, "clear", OboeContext::clear);
  NODE_SET_METHOD(exports, "isValid", OboeContext::isValid);
  NODE_SET_METHOD(exports, "init", OboeContext::init);
  NODE_SET_METHOD(exports, "createEvent", OboeContext::createEvent);
  NODE_SET_METHOD(exports, "startTrace", OboeContext::startTrace);

  module->Set(String::NewSymbol("Context"), exports);
}
