#ifndef OBOE_EVENT_H
#define OBOE_EVENT_H

#include <cstring>
#include <node.h>

namespace appneta {
namespace oboe {

class Event : public node::ObjectWrap {
  private:
    explicit Event();
    explicit Event(const oboe_metadata_t*, bool);
    ~Event();

    oboe_event_t* event;
    static v8::Persistent<v8::Function> constructor;
    static v8::Handle<v8::Value> New(const v8::Arguments&);
    static v8::Handle<v8::Value> addInfo(const v8::Arguments&);
    static v8::Handle<v8::Value> addEdge(const v8::Arguments&);
    static v8::Handle<v8::Value> addEdgeStr(const v8::Arguments&);

  public:
    static void Init(v8::Isolate*, v8::Handle<v8::Object>);
};

using namespace v8;

Persistent<Function> Event::constructor;

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


Handle<Value> Event::addInfo(const Arguments& args) {
  HandleScope scope;

  if (args.Length() != 2) {
    ThrowException(Exception::TypeError(String::New("Wrong number of arguments")));
    return scope.Close(Undefined());
  }

  if (!args[0]->IsString()) {
    ThrowException(Exception::TypeError(String::New("Key must be a string")));
    return scope.Close(Undefined());
  }

  if (!args[1]->IsString() && !args[1]->IsNumber()) {
    ThrowException(Exception::TypeError(String::New("Value must be a string or number")));
    return scope.Close(Undefined());
  }

  Event* inst = ObjectWrap::Unwrap<Event>(args.This());

  bool status;

  char* key = *String::AsciiValue(args[0]);
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

  return scope.Close(Boolean::New(status));
}


Handle<Value> Event::addEdge(const Arguments& args) {
  HandleScope scope;

  if (args.Length() != 2) {
    ThrowException(Exception::TypeError(String::New("Wrong number of arguments")));
    return scope.Close(Undefined());
  }

  if (!args[0]->IsObject()) {
    ThrowException(Exception::TypeError(String::New("Must supply edge metadata")));
    return scope.Close(Undefined());
  }

  Event* inst = ObjectWrap::Unwrap<Event>(args.This());
  Metadata* metadata = node::ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());
  bool status = oboe_event_add_edge(inst->event, metadata->getMetadata()) == 0;

  return scope.Close(Boolean::New(status));
}


Handle<Value> Event::addEdgeStr(const Arguments& args) {
  HandleScope scope;

  if (args.Length() != 2) {
    ThrowException(Exception::TypeError(String::New("Wrong number of arguments")));
    return scope.Close(Undefined());
  }

  if (!args[0]->IsString()) {
    ThrowException(Exception::TypeError(String::New("Must supply an edge string")));
    return scope.Close(Undefined());
  }

  Event* inst = ObjectWrap::Unwrap<Event>(args.This());

  std::string val(*String::Utf8Value(args[0]));
  bool status = oboe_event_add_edge_fromstr(inst->event, val.c_str(), val.size()) == 0;

  return scope.Close(Boolean::New(status));
}


// Handle<Value> Event::getMetadata(const Arguments& args) {
//   HandleScope scope;
//
//   Local<Value> argv[1] = {  };
//   Handle<Value> metadata = Metadata::constructor->NewInstance(1, argv);
//   return scope.Close(metadata);
// }


// Creates a new Javascript instance
Handle<Value> Event::New(const Arguments& args) {
  HandleScope scope;

  // Invoked as constructor: `new MyObject(...)`
  if (args.IsConstructCall()) {
    Event* obj = new Event();
    obj->Wrap(args.This());
    return args.This();

  // Invoked as plain function `MyObject(...)`, turn into construct call.
  } else {
    Local<Value> argv[0] = {};
    return scope.Close(constructor->NewInstance(0, argv));
  }
}

// Wrap the C++ object so V8 can understand it
void Event::Init(Isolate* isolate, Handle<Object> exports) {
  // Prepare constructor template
  Local<FunctionTemplate> tpl = FunctionTemplate::New(New);
  tpl->SetClassName(String::NewSymbol("OboeEvent"));
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  // Prototype
  tpl->PrototypeTemplate()->Set(
    String::NewSymbol("addInfo"),
    FunctionTemplate::New(addInfo)->GetFunction()
  );
  tpl->PrototypeTemplate()->Set(
    String::NewSymbol("addEdge"),
    FunctionTemplate::New(addEdge)->GetFunction()
  );
  tpl->PrototypeTemplate()->Set(
    String::NewSymbol("addEdgeStr"),
    FunctionTemplate::New(addEdgeStr)->GetFunction()
  );
  // tpl->PrototypeTemplate()->Set(
  //   String::NewSymbol("getMetadata"),
  //   FunctionTemplate::New(getMetadata)->GetFunction()
  // );
  // tpl->PrototypeTemplate()->Set(
  //   String::NewSymbol("metadataString"),
  //   FunctionTemplate::New(metadataString)->GetFunction()
  // );
  // tpl->PrototypeTemplate()->Set(
  //   String::NewSymbol("startTrace"),
  //   FunctionTemplate::New(startTrace)->GetFunction()
  // );

  constructor = Persistent<Function>::New(tpl->GetFunction());
  exports->Set(String::NewSymbol("OboeEvent"), constructor);
}

}  // namespace oboe
}  // namespace appneta

#endif
