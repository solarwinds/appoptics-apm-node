#include "node-oboe.h"

using namespace v8;

Persistent<FunctionTemplate> Event::constructor;

// Construct a blank event from the context metadata
Event::Event() {
  oboe_event_init(&event, OboeContext::get());
}

// Construct a new event point an edge at another
Event::Event(const oboe_metadata_t *md, bool addEdge) {
  // both methods copy metadata from md -> this
  if (addEdge) {
    // create_event automatically adds edge in event to md
    oboe_metadata_create_event(md, &event);
  } else {
    // initializes new Event with this md's task_id & new random op_id; no edges set
    oboe_event_init(&event, md);
  }
}

// Remember to cleanup the struct when garbage collected
Event::~Event() {
  oboe_event_destroy(&event);
}

// Add info to the event
NAN_METHOD(Event::addInfo) {
  NanScope();

  // Validate arguments
  if (args.Length() != 2) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsString()) {
    return NanThrowTypeError("Key must be a string");
  }
  if (!args[1]->IsString() && !args[1]->IsNumber()) {
    return NanThrowTypeError("Value must be a string or number");
  }

  // Unwrap event instance from V8
  Event* self = ObjectWrap::Unwrap<Event>(args.This());

  // Get key string from arguments and prepare a status variable
  char* key = *String::Utf8Value(args[0]);
  bool status;

  // Handle string values
  if (args[1]->IsString()) {
    // Get value string from arguments
    std::string val(*String::Utf8Value(args[1]));

    // Detect if we should add as binary or a string
    // TODO: Should probably use buffers for binary data...
    if (memchr(val.data(), '\0', val.size())) {
      status = oboe_event_add_info_binary(&self->event, key, val.data(), val.size()) == 0;
    } else {
      status = oboe_event_add_info(&self->event, key, val.data()) == 0;
    }

  // Handle number values
  } else {
    double val = args[1]->NumberValue();
    status = oboe_event_add_info_double(&self->event, key, val) == 0;
  }

  NanReturnValue(NanNew<Boolean>(status));
}

// Add an edge from a metadata instance
NAN_METHOD(Event::addEdge) {
  NanScope();

  // Validate arguments
  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsObject()) {
    return NanThrowTypeError("Must supply an edge metadata");
  }

  // Unwrap event instance from V8
  Event* self = ObjectWrap::Unwrap<Event>(args.This());

  // Unwrap metadata instance from arguments
  Metadata* metadata = node::ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());

  // Attempt to add the edge
  bool status = oboe_event_add_edge(&self->event, &metadata->metadata) == 0;

  NanReturnValue(NanNew<Boolean>(status));
}

// Add an edge by string value
NAN_METHOD(Event::addEdgeStr) {
  NanScope();

  // Validate arguments
  if (args.Length() != 2) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsString()) {
    return NanThrowTypeError("Must supply an edge string");
  }

  // Unwrap event instance from V8
  Event* self = ObjectWrap::Unwrap<Event>(args.This());

  // Get string data from arguments
  std::string val(*String::Utf8Value(args[0]));

  // Attempt to add edge
  bool status = oboe_event_add_edge_fromstr(&self->event, val.c_str(), val.size()) == 0;

  NanReturnValue(NanNew<Boolean>(status));
}

// Get the metadata of an event
NAN_METHOD(Event::getMetadata) {
  NanScope();

  // Unwrap event instance from V8
  Event* self = ObjectWrap::Unwrap<Event>(args.This());
  oboe_event_t* event = &self->event;

  // Construct a new metadata instance from the event metadata
  Metadata* metadata = new Metadata(&event->metadata);
  Local<Object> handle;
  metadata->Wrap(handle);

  // Return a new instance of it.
  // TODO: wrapping a local and using as an arg is probably bad.
  // I should see if returning a handle works correctly.
  Local<Value> argv[1] = { handle };
  NanReturnValue(Metadata::constructor->GetFunction()->NewInstance(1, argv));
}

// Get the metadata of an event as a string
NAN_METHOD(Event::metadataString) {
  NanScope();

  // Unwrap the event instance from V8
  Event* self = ObjectWrap::Unwrap<Event>(args.This());

  // Get a pointer to the event struct
  oboe_event_t* event = &self->event;

  // Build a character array from the event metadata content
  char buf[OBOE_MAX_METADATA_PACK_LEN];
  int rc = oboe_metadata_tostr(&event->metadata, buf, sizeof(buf) - 1);

  // If we have data, return it as a string
  if (rc == 0) {
    NanReturnValue(NanNew<String>(buf));

  // Otherwise, return an empty string
  } else {
    NanReturnEmptyString();
  }
}

// Start tracing using supplied metadata
NAN_METHOD(Event::startTrace) {
  NanScope();

  // Validate arguments
  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsObject()) {
    return NanThrowTypeError("Must supply a metadata instance");
  }

  // Unwrap metadata from arguments
  Metadata* metadata = node::ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());

  // Create new event from metadata
  Event* event = new Event(&metadata->metadata, false);

  // NOTE: This is wrong. Need to make a new `this` somehow.
  event->Wrap(args.This());
  NanReturnValue(args.This());
}

// Creates a new Javascript instance
NAN_METHOD(Event::New) {
  NanScope();

  // Invoked as constructor: `new Event(...)`
  if (args.IsConstructCall()) {
    Event* event = new Event();
    event->Wrap(args.This());
		NanReturnValue(args.This());

  // Invoked as plain function `Event(...)`, turn into construct call.
  } else {
    Local<Value> argv[0] = {};
    NanReturnValue(constructor->GetFunction()->NewInstance(0, argv));
  }
}

// Wrap the C++ object so V8 can understand it
void Event::Init(Handle<Object> exports) {
	NanScope();

  // Prepare constructor template
  Handle<FunctionTemplate> ctor = NanNew<FunctionTemplate>(New);
  ctor->InstanceTemplate()->SetInternalFieldCount(1);
  ctor->SetClassName(NanSymbol("OboeEvent"));
  NanAssignPersistent(constructor, ctor);

  // Prototype
  NODE_SET_PROTOTYPE_METHOD(ctor, "addInfo", Event::addInfo);
  NODE_SET_PROTOTYPE_METHOD(ctor, "addEdge", Event::addEdge);
  NODE_SET_PROTOTYPE_METHOD(ctor, "addEdgeStr", Event::addEdgeStr);
  NODE_SET_PROTOTYPE_METHOD(ctor, "getMetadata", Event::getMetadata);
  NODE_SET_PROTOTYPE_METHOD(ctor, "metadataString", Event::metadataString);
  NODE_SET_PROTOTYPE_METHOD(ctor, "startTrace", Event::startTrace);

  exports->Set(NanSymbol("OboeEvent"), ctor->GetFunction());
}
