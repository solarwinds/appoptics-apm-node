#ifndef OBOE_METADATA_H
#define OBOE_METADATA_H

#include <node.h>

namespace appneta {
namespace oboe {

class Metadata : public node::ObjectWrap {
  friend class Event;

  private:
    explicit Metadata();
    explicit Metadata(oboe_metadata_t*);
    ~Metadata();

    oboe_metadata_t* metadata;
    static v8::Persistent<v8::Function> constructor;
    static v8::Handle<v8::Value> New(const v8::Arguments&);

  public:
    static void Init(v8::Isolate*, v8::Handle<v8::Object>);
    oboe_metadata_t* getMetadata();
};

using namespace v8;

Persistent<Function> Metadata::constructor;

Metadata::Metadata(oboe_metadata_t *md) {
  oboe_metadata_copy(metadata, md);
}

Metadata::~Metadata() {
  oboe_metadata_destroy(metadata);
}

oboe_metadata_t* Metadata::getMetadata() {
  return metadata;
}

// Creates a new Javascript instance
Handle<Value> Metadata::New(const Arguments& args) {
  HandleScope scope;

  // Invoked as constructor: `new MyObject(...)`
  if (args.IsConstructCall()) {
    Metadata* obj = new Metadata();
    obj->Wrap(args.This());
    return args.This();

  // Invoked as plain function `MyObject(...)`, turn into construct call.
  } else {
    Local<Value> argv[0] = {};
    return scope.Close(constructor->NewInstance(0, argv));
  }
}

// Wrap the C++ object so V8 can understand it
void Metadata::Init(Isolate* isolate, Handle<Object> exports) {
  // Prepare constructor template
  Local<FunctionTemplate> tpl = FunctionTemplate::New(New);
  tpl->SetClassName(String::NewSymbol("OboeMetadata"));
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  // Prototype
  // tpl->PrototypeTemplate()->Set(
  //   String::NewSymbol("addInfo"),
  //   FunctionTemplate::New(addInfo)->GetFunction()
  // );

  constructor = Persistent<Function>::New(tpl->GetFunction());
  exports->Set(String::NewSymbol("OboeMetadata"), constructor);
}

}  // namespace oboe
}  // namespace appneta

#endif
