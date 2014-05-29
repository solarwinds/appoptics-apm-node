#include "../node-oboe.h"

using namespace v8;

Persistent<FunctionTemplate> UdpReporter::constructor;

// Construct with an address and port to report to
UdpReporter::UdpReporter(const char *addr, const char *port=NULL) {
  if (port == NULL) {
    port = "7831";
  }

  oboe_reporter_udp_init(&reporter, addr, port);
}

// Remember to cleanup the udp reporter struct when garbage collected
UdpReporter::~UdpReporter() {
  oboe_reporter_destroy(&reporter);
}

// Transform a string back into a metadata instance
NAN_METHOD(UdpReporter::sendReport) {
  NanScope();

  if (args.Length() > 1) {
    return NanThrowError("Wrong number of arguments");
  }

  UdpReporter* self = ObjectWrap::Unwrap<UdpReporter>(args.This());

  Event* event = ObjectWrap::Unwrap<Event>(args.This());

  oboe_metadata_t *md;
  if (args.Length() == 2 && args[1]->IsObject()) {
    Metadata* metadata = ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());
    md = &metadata->metadata;
  } else {
    md = OboeContext::get();
  }

  bool status = oboe_reporter_send(&self->reporter, md, &event->event) >= 0;
  NanReturnValue(NanNew<Boolean>(status));
}

// Creates a new Javascript instance
NAN_METHOD(UdpReporter::New) {
  NanScope();

  // Validate arguments
  if (args.Length() < 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsString()) {
    return NanThrowError("Address must be a string");
  }

  char* addr = *String::Utf8Value(args[0]);

  // Port is optional
  char* port = NULL;
  Local<Value> portLocal;
  if (args.Length() > 1 && args[1]->IsString()) {
    port = *String::Utf8Value(args[1]);
    portLocal = args[1];
  }

  // Invoked as constructor: `new MyObject(...)`
  if (args.IsConstructCall()) {
    UdpReporter* obj = new UdpReporter(addr, port);
    obj->Wrap(args.This());
    NanReturnValue(args.This());

  // Invoked as plain function `MyObject(...)`, turn into construct call.
  } else {
    Local<Value> argv[2] = { args[0], portLocal };
    NanReturnValue(constructor->GetFunction()->NewInstance(0, argv));
  }
}

// Wrap the C++ object so V8 can understand it
void UdpReporter::Init(Handle<Object> exports) {
	NanScope();

  // Prepare constructor template
  Handle<FunctionTemplate> ctor = NanNew<FunctionTemplate>(New);
  ctor->InstanceTemplate()->SetInternalFieldCount(1);
  ctor->SetClassName(NanSymbol("OboeUdpReporter"));
  NanAssignPersistent(constructor, ctor);

  // Prototype
  NODE_SET_PROTOTYPE_METHOD(ctor, "sendReport", UdpReporter::sendReport);

  exports->Set(NanSymbol("OboeUdpReporter"), ctor->GetFunction());
}
