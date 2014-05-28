#include "metadata.h"

using namespace v8;

Persistent<FunctionTemplate> Metadata::constructor;

Metadata::Metadata() {}

// Allow construction of clones
Metadata::Metadata(oboe_metadata_t *md) {
  oboe_metadata_copy(&metadata, md);
}

// Remember to cleanup the metadata struct when garbage collected
Metadata::~Metadata() {
  oboe_metadata_destroy(&metadata);
}

// Transform a string back into a metadata instance
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

// Make a new metadata instance with randomized data
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

// Copy the contents of the metadata instance to a new instance
NAN_METHOD(Metadata::copy) {
  NanScope();

  Local<Value> argv[1] = { args.This() };
  NanReturnValue(constructor->GetFunction()->NewInstance(0, argv));
}

// Verify that the state of the metadata instance is valid
NAN_METHOD(Metadata::isValid) {
  NanScope();

  Metadata* self = ObjectWrap::Unwrap<Metadata>(args.This());
  bool status = oboe_metadata_is_valid(&self->metadata);
  NanReturnValue(NanNew<Boolean>(status));
}

// Serialize a metadata object to a string
NAN_METHOD(Metadata::toString) {
  NanScope();

  // Unwrap the Metadata instance from V8
  Metadata* self = ObjectWrap::Unwrap<Metadata>(args.This());

  // Convert the contents to a character array
  char buf[OBOE_MAX_METADATA_PACK_LEN];
  int rc = oboe_metadata_tostr(&self->metadata, buf, sizeof(buf) - 1);

  // If it worked, return it
  if (rc == 0) {
    NanReturnValue(NanNew<String>(buf));

  // Otherwise, return an empty string
  } else {
    NanReturnEmptyString();
  }
}

// Create an event from this metadata instance
NAN_METHOD(Metadata::createEvent) {
  NanScope();

  // Unwrap the Metadata instance from V8
  Metadata* self = ObjectWrap::Unwrap<Metadata>(args.This());

  // Construct a new metadata instance from the event metadata
  Event* event = new Event(&event->metadata);
  Local<Object> handle;
  event->Wrap(handle);

  // Return a new instance of it.
  // TODO: wrapping a local and using as an arg is probably bad.
  // I should see if returning a handle works correctly.
  Local<Value> argv[1] = { handle };
  NanReturnValue(Event::constructor->GetFunction()->NewInstance(1, argv));
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
