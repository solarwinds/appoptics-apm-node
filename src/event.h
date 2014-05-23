#ifndef OBOE_EVENT_H
#define OBOE_EVENT_H

#include <node.h>
#include "event.h"

namespace appneta {
namespace oboe {


class Event : public node::ObjectWrap {
  private:
    static v8::Persistent<v8::Function> constructor;
    oboe_event_t* event;

    Event() {
      oboe_event_init(event, Context::get());
    }

    ~Event() {
      oboe_event_destroy(event);
    }

  public:
    static v8::Handle<v8::Value> New(const v8::Arguments& args) {
      v8::HandleScope scope;

      // Invoked as constructor: `new MyObject(...)`
      if (args.IsConstructCall()) {
        Event* obj = new Event();
        obj->Wrap(args.This());
        return args.This();

      // Invoked as plain function `MyObject(...)`, turn into construct call.
      } else {
        v8::Local<v8::Value> argv[0] = {};
        return scope.Close(constructor->NewInstance(0, argv));
      }
    }

    // Wrap the C++ object so V8 can understand it
    static void Init(v8::Isolate* isolate, v8::Handle<v8::Object> exports) {
      // Prepare constructor template
      v8::Local<v8::FunctionTemplate> tpl = v8::FunctionTemplate::New(New);
      tpl->SetClassName(v8::String::NewSymbol("OboeEvent"));
      tpl->InstanceTemplate()->SetInternalFieldCount(1);

      // Prototype
      // tpl->PrototypeTemplate()->Set(
      //   v8::String::NewSymbol("addInfo"),
      //   v8::FunctionTemplate::New(addInfo)->GetFunction()
      // );
      // tpl->PrototypeTemplate()->Set(
      //   v8::String::NewSymbol("addEdge"),
      //   v8::FunctionTemplate::New(addEdge)->GetFunction()
      // );
      // tpl->PrototypeTemplate()->Set(
      //   v8::String::NewSymbol("addEdgeStr"),
      //   v8::FunctionTemplate::New(addEdgeStr)->GetFunction()
      // );
      // tpl->PrototypeTemplate()->Set(
      //   v8::String::NewSymbol("getMetadata"),
      //   v8::FunctionTemplate::New(getMetadata)->GetFunction()
      // );
      // tpl->PrototypeTemplate()->Set(
      //   v8::String::NewSymbol("metadataString"),
      //   v8::FunctionTemplate::New(metadataString)->GetFunction()
      // );
      // tpl->PrototypeTemplate()->Set(
      //   v8::String::NewSymbol("startTrace"),
      //   v8::FunctionTemplate::New(startTrace)->GetFunction()
      // );

      constructor = v8::Persistent<v8::Function>::New(tpl->GetFunction());
      exports->Set(v8::String::NewSymbol("OboeEvent"), constructor);
    }
};

}  // namespace oboe
}  // namespace appneta

#endif
