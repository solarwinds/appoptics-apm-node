#include "metadata.h"

using namespace v8;

Persistent<FunctionTemplate> Metadata::constructor;

Metadata::Metadata() {}

Metadata::Metadata(oboe_metadata_t *md) {
  oboe_metadata_copy(&metadata, md);
}

Metadata::~Metadata() {
  oboe_metadata_destroy(&metadata);
}

oboe_metadata_t* Metadata::getMetadata() {
  return &metadata;
}

NAN_METHOD(Metadata::fromString) {
  NanScope();

  std::string s(*String::Utf8Value(args[0]));

  oboe_metadata_t md;
  oboe_metadata_fromstr(&md, s.data(), s.size());

  Metadata* metadata = new Metadata(&md);
  Local<Object> handle;
  metadata->Wrap(handle);

  Local<Value> argv[1] = { handle };
  NanReturnValue(constructor->GetFunction()->NewInstance(0, argv));
}

NAN_METHOD(Metadata::makeRandom) {
  NanScope();

  oboe_metadata_t md;
  oboe_metadata_init(&md);
  oboe_metadata_random(&md);

  Metadata* metadata = new Metadata(&md);
  Local<Object> handle;
  metadata->Wrap(handle);

  Local<Value> argv[1] = { handle };
  NanReturnValue(constructor->GetFunction()->NewInstance(0, argv));
}

NAN_METHOD(Metadata::copy) {
  NanScope();

  Local<Value> argv[1] = { args.This() };
  NanReturnValue(constructor->GetFunction()->NewInstance(0, argv));
}

NAN_METHOD(Metadata::isValid) {
  NanScope();

  Metadata* self = ObjectWrap::Unwrap<Metadata>(args.This());
  bool status = oboe_metadata_is_valid(&self->metadata);
  NanReturnValue(NanNew<Boolean>(status));
}

NAN_METHOD(Metadata::toString) {
  NanScope();

  Metadata* self = ObjectWrap::Unwrap<Metadata>(args.This());

  char buf[OBOE_MAX_METADATA_PACK_LEN];

  int rc = oboe_metadata_tostr(&self->metadata, buf, sizeof(buf) - 1);
  if (rc == 0) {
      NanReturnValue(NanNew<String>(buf));
  } else {
      NanReturnEmptyString();
  }
}

// Creates a new Javascript instance
NAN_METHOD(Metadata::New) {
  NanScope();

  // Invoked as constructor: `new MyObject(...)`
  if (args.IsConstructCall()) {
    Metadata* obj;

    if (args.Length() == 1) {
      Metadata* from = node::ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());
      obj = new Metadata(&from->metadata);
    } else {
      obj = new Metadata();
    }

    obj->Wrap(args.This());
    NanReturnValue(args.This());

  // Invoked as plain function `MyObject(...)`, turn into construct call.
  } else {
    Local<Value> argv[0] = {};
    NanReturnValue(constructor->GetFunction()->NewInstance(0, argv));
  }
}

// Wrap the C++ object so V8 can understand it
void Metadata::Init(Handle<Object> exports) {
	NanScope();

  // Prepare constructor template
  Handle<FunctionTemplate> ctor = NanNew<FunctionTemplate>(New);
  ctor->InstanceTemplate()->SetInternalFieldCount(1);
  ctor->SetClassName(NanSymbol("OboeMetadata"));
  NanAssignPersistent(constructor, ctor);

  // Statics
  NODE_SET_METHOD(ctor, "fromString", Metadata::fromString);
  NODE_SET_METHOD(ctor, "makeRandom", Metadata::makeRandom);

  // Prototype
  NODE_SET_PROTOTYPE_METHOD(ctor, "copy", Metadata::copy);
  NODE_SET_PROTOTYPE_METHOD(ctor, "isValid", Metadata::isValid);
  NODE_SET_PROTOTYPE_METHOD(ctor, "toString", Metadata::toString);

  exports->Set(NanSymbol("OboeMetadata"), ctor->GetFunction());
}
