#include "event.h"

using namespace v8;

Persistent<FunctionTemplate> Event::constructor;

Event::Event() {
  oboe_event_init(&event, context::get());
}

Event::Event(const oboe_metadata_t *md, bool addEdge=true) {
  // both methods copy metadata from md -> this
  if (addEdge) {
    // create_event automatically adds edge in event to md
    oboe_metadata_create_event(md, &event);
  } else {
    // initializes new Event with this md's task_id & new random op_id; no edges set
    oboe_event_init(&event, md);
  }
}

Event::~Event() {
  oboe_event_destroy(&event);
}


NAN_METHOD(Event::addInfo) {
  NanScope();

  if (args.Length() != 2) {
    return NanThrowError("Wrong number of arguments");
  }

  if (!args[0]->IsString()) {
    return NanThrowTypeError("Key must be a string");
  }

  if (!args[1]->IsString() && !args[1]->IsNumber()) {
    return NanThrowTypeError("Value must be a string or number");
  }

  Event* inst = ObjectWrap::Unwrap<Event>(args.This());

  bool status;

  char* key = *String::Utf8Value(args[0]);
  if (args[1]->IsString()) {
    std::string val(*String::Utf8Value(args[1]));
    if (memchr(val.data(), '\0', val.size())) {
      status = oboe_event_add_info_binary(&inst->event, key, val.data(), val.size()) == 0;
    } else {
      status = oboe_event_add_info(&inst->event, key, val.data()) == 0;
    }
  } else {
    double val = args[1]->NumberValue();
    status = oboe_event_add_info_double(&inst->event, key, val) == 0;
  }

  NanReturnValue(NanNew<Boolean>(status));
}


NAN_METHOD(Event::addEdge) {
  NanScope();

  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }

  if (!args[0]->IsObject()) {
    return NanThrowTypeError("Must supply an edge metadata");
  }

  Event* inst = ObjectWrap::Unwrap<Event>(args.This());
  Metadata* metadata = node::ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());
  bool status = oboe_event_add_edge(&inst->event, metadata->getMetadata()) == 0;

  NanReturnValue(NanNew<Boolean>(status));
}


NAN_METHOD(Event::addEdgeStr) {
  NanScope();

  if (args.Length() != 2) {
    return NanThrowError("Wrong number of arguments");
  }

  if (!args[0]->IsString()) {
    return NanThrowTypeError("Must supply an edge string");
  }

  Event* self = ObjectWrap::Unwrap<Event>(args.This());

  std::string val(*String::Utf8Value(args[0]));
  bool status = oboe_event_add_edge_fromstr(&self->event, val.c_str(), val.size()) == 0;

  NanReturnValue(NanNew<Boolean>(status));
}


NAN_METHOD(Event::getMetadata) {
  NanScope();

  Event* self = ObjectWrap::Unwrap<Event>(args.This());
  oboe_event_t* event = &self->event;

  Metadata* metadata = new Metadata(&event->metadata);
  Local<Object> handle;
  metadata->Wrap(handle);

  Local<Value> argv[1] = { handle };
  NanReturnValue(Metadata::constructor->GetFunction()->NewInstance(1, argv));
}


NAN_METHOD(Event::metadataString) {
  NanScope();

  Event* self = ObjectWrap::Unwrap<Event>(args.This());
  oboe_event_t* event = &self->event;

  char buf[OBOE_MAX_METADATA_PACK_LEN];

  int rc = oboe_metadata_tostr(&event->metadata, buf, sizeof(buf) - 1);
  if (rc == 0) {
    NanReturnValue(NanNew<String>(buf));
  } else {
    NanReturnEmptyString();
  }
}


NAN_METHOD(Event::startTrace) {
  NanScope();

  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsObject()) {
    return NanThrowTypeError("Must supply a metadata instance");
  }

  Metadata* metadata = node::ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());

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
