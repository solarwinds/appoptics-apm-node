#include "node-oboe.h"
#include <iostream>

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

  Handle<Value> argv[1] = { External::New((void *) &md) };
  NanReturnValue(Metadata::constructor->GetFunction()->NewInstance(1, argv));
}

// Make a new metadata instance with randomized data
NAN_METHOD(Metadata::makeRandom) {
  NanScope();

  oboe_metadata_t md;
  oboe_metadata_init(&md);
  oboe_metadata_random(&md);

  Handle<Value> argv[1] = { External::New((void *) &md) };
  NanReturnValue(Metadata::constructor->GetFunction()->NewInstance(1, argv));
}

// Copy the contents of the metadata instance to a new instance
NAN_METHOD(Metadata::copy) {
  NanScope();

  Metadata* self = ObjectWrap::Unwrap<Metadata>(args.This());

  Handle<Value> argv[1] = { External::New((void *) &self->metadata) };
  NanReturnValue(Metadata::constructor->GetFunction()->NewInstance(1, argv));
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

  Handle<Value> argv[1] = { External::New((void *) &self->metadata) };
  NanReturnValue(Event::constructor->GetFunction()->NewInstance(1, argv));
}

// Creates a new Javascript instance
NAN_METHOD(Metadata::New) {
  NanScope();

  // Invoked as constructor: `new MyObject(...)`
  if (args.IsConstructCall()) {
    Metadata* obj;

    if (args.Length() == 1) {
      oboe_metadata_t* context;
      if (args[0]->IsExternal()) {
        context = (oboe_metadata_t*) External::Unwrap(args[0]);
      } else {
        Metadata* from = ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());
        context = &from->metadata;
      }
      obj = new Metadata(context);
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
  ctor->SetClassName(NanSymbol("Metadata"));
  NanAssignPersistent(constructor, ctor);

  // Statics
  NODE_SET_METHOD(ctor, "fromString", Metadata::fromString);
  NODE_SET_METHOD(ctor, "makeRandom", Metadata::makeRandom);

  // Prototype
  NODE_SET_PROTOTYPE_METHOD(ctor, "copy", Metadata::copy);
  NODE_SET_PROTOTYPE_METHOD(ctor, "isValid", Metadata::isValid);
  NODE_SET_PROTOTYPE_METHOD(ctor, "toString", Metadata::toString);
  NODE_SET_PROTOTYPE_METHOD(ctor, "createEvent", Metadata::createEvent);

  exports->Set(NanSymbol("Metadata"), ctor->GetFunction());
}
