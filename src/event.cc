#include "event.h"

namespace appneta {
namespace nodoboe {

using namespace v8;

Persistent<FunctionTemplate> Event::constructor;

Event::Event() {
  oboe_event_init(event, context::get());
}

Event::Event(const oboe_metadata_t *md, bool addEdge=true) {
  // both methods copy metadata from md -> this
  if (addEdge) {
    // create_event automatically adds edge in event to md
    oboe_metadata_create_event(md, event);
  } else {
    // initializes new Event with this md's task_id & new random op_id; no edges set
    oboe_event_init(event, md);
  }
}

Event::~Event() {
  oboe_event_destroy(event);
}


NAN_METHOD(Event::addInfo) {
  NanScope();

  if (args.Length() != 2) {
    return NanThrowError("Wrong number of arguments");
  }

  if (!args[0]->IsString()) {
    return NanThrowError("Key must be a string");
  }

  if (!args[1]->IsString() && !args[1]->IsNumber()) {
    return NanThrowError("Value must be a string or number");
  }

  Event* inst = ObjectWrap::Unwrap<Event>(args.This());

  bool status;

  char* key = *String::Utf8Value(args[0]);
  if (args[1]->IsString()) {
    std::string val(*String::Utf8Value(args[1]));
    if (memchr(val.data(), '\0', val.size())) {
      status = oboe_event_add_info_binary(inst->event, key, val.data(), val.size()) == 0;
    } else {
      status = oboe_event_add_info(inst->event, key, val.data()) == 0;
    }
  } else {
    double val = args[1]->NumberValue();
    status = oboe_event_add_info_double(inst->event, key, val) == 0;
  }

  NanReturnValue(NanNew<Boolean>(status));
}


NAN_METHOD(Event::addEdge) {
  NanScope();

  if (args.Length() != 2) {
    return NanThrowError("Wrong number of arguments");
  }

  if (!args[0]->IsObject()) {
    return NanThrowError("Must supply an edge metadata");
  }

  Event* inst = ObjectWrap::Unwrap<Event>(args.This());
  Metadata* metadata = node::ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());
  bool status = oboe_event_add_edge(inst->event, metadata->getMetadata()) == 0;

  NanReturnValue(NanNew<Boolean>(status));
}


NAN_METHOD(Event::addEdgeStr) {
  NanScope();

  if (args.Length() != 2) {
    return NanThrowError("Wrong number of arguments");
  }

  if (!args[0]->IsString()) {
    return NanThrowError("Must supply an edge string");
  }

  Event* inst = ObjectWrap::Unwrap<Event>(args.This());

  std::string val(*String::Utf8Value(args[0]));
  bool status = oboe_event_add_edge_fromstr(inst->event, val.c_str(), val.size()) == 0;

  NanReturnValue(NanNew<Boolean>(status));
}


// NAN_METHOD(Event::getMetadata) {
//   NanScope();
//
//   Local<Value> argv[1] = {  };
//   Handle<Value> metadata = Metadata::constructor->NewInstance(1, argv);
//   return scope.Close(metadata);
// }


// Creates a new Javascript instance
NAN_METHOD(Event::New) {
  NanScope();

  // Invoked as constructor: `new MyObject(...)`
  if (args.IsConstructCall()) {
    Event* obj = new Event();
    obj->Wrap(args.This());
    return args.This();

  // Invoked as plain function `MyObject(...)`, turn into construct call.
  } else {
    Local<Value> argv[0] = {};
    return scope.Close(constructor->GetFunction()->NewInstance(0, argv));
  }
}

// Wrap the C++ object so V8 can understand it
void Event::Init(Handle<Object> exports) {
  // Prepare constructor template
  Handle<FunctionTemplate> ctor = NanNew<FunctionTemplate>(New);
  NanAssignPersistent(constructor, ctor);
  ctor->SetClassName(NanSymbol("OboeEvent"));
  ctor->InstanceTemplate()->SetInternalFieldCount(1);

  // Prototype
  NODE_SET_PROTOTYPE_METHOD(ctor, "addInfo", Event::addInfo);
  NODE_SET_PROTOTYPE_METHOD(ctor, "addEdge", Event::addInfo);
  NODE_SET_PROTOTYPE_METHOD(ctor, "addEdgeStr", Event::addInfo);
  // NODE_SET_PROTOTYPE_METHOD(ctor, "getMetadata", Event::addInfo);
  // NODE_SET_PROTOTYPE_METHOD(ctor, "metadataString", Event::addInfo);
  // NODE_SET_PROTOTYPE_METHOD(ctor, "startTrace", Event::addInfo);

  exports->Set(NanSymbol("OboeEvent"), ctor->GetFunction());
}

}  // namespace nodoboe
}  // namespace appneta
