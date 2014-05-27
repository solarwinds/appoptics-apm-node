#include "metadata.h"

namespace appneta {
namespace nodoboe {

using namespace v8;

Persistent<FunctionTemplate> Metadata::constructor;

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
NAN_METHOD(Metadata::New) {
  NanScope();

  // Invoked as constructor: `new MyObject(...)`
  if (args.IsConstructCall()) {
    Metadata* obj = new Metadata();
    obj->Wrap(args.This());
    NanReturnValue(args.This());

  // Invoked as plain function `MyObject(...)`, turn into construct call.
  } else {
    Local<Value> argv[0] = {};
    return scope.Close(constructor->GetFunction()->NewInstance(0, argv));
  }
}

// Wrap the C++ object so V8 can understand it
void Metadata::Init(Handle<Object> exports) {
  // Prepare constructor template
  Handle<FunctionTemplate> ctor = NanNew<FunctionTemplate>(New);
  NanAssignPersistent(constructor, ctor);
  ctor->InstanceTemplate()->SetInternalFieldCount(1);
  ctor->SetClassName(NanSymbol("OboeMetadata"));

  // Prototype
  // NODE_SET_PROTOTYPE_METHOD(ctor, "addInfo", Metadata::addInfo)

  exports->Set(NanSymbol("OboeMetadata"), ctor->GetFunction());
}

}  // namespace nodoboe
}  // namespace appneta
