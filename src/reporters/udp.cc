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

  if (args.Length() < 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsObject()) {
    return NanThrowError("Must supply an event instance");
  }

  UdpReporter* self = ObjectWrap::Unwrap<UdpReporter>(args.This());
  Event* event = ObjectWrap::Unwrap<Event>(args[0]->ToObject());

  oboe_metadata_t *md;
  if (args.Length() == 2 && args[1]->IsObject()) {
    Metadata* metadata = ObjectWrap::Unwrap<Metadata>(args[1]->ToObject());
    md = &metadata->metadata;
  } else {
    md = OboeContext::get();
  }

  int status = oboe_reporter_send(&self->reporter, md, &event->event);
  printf("udp send status is: %d\n", status);
  NanReturnValue(NanNew<Boolean>(status >= 0));
}

// Creates a new Javascript instance
NAN_METHOD(UdpReporter::New) {
  NanScope();

  if (!args.IsConstructCall()) {
    return NanThrowError("UdpReporter() must be called as a constructor");
  }

  // Validate arguments
  if (args.Length() < 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsString()) {
    return NanThrowError("Address must be a string");
  }

  String::Utf8Value v8_addr(args[0]);
  const char* addr = *v8_addr;
  UdpReporter* obj;

  if (args.Length() > 1 && (args[1]->IsString() || args[1]->IsNumber())) {
    String::Utf8Value port(args[1]);
    obj = new UdpReporter(addr, *port);
  } else {
    obj = new UdpReporter(addr);
  }

  obj->Wrap(args.This());
  NanReturnValue(args.This());
}

// Wrap the C++ object so V8 can understand it
void UdpReporter::Init(Handle<Object> exports) {
	NanScope();

  // Prepare constructor template
  Handle<FunctionTemplate> ctor = NanNew<FunctionTemplate>(New);
  ctor->InstanceTemplate()->SetInternalFieldCount(1);
  ctor->SetClassName(NanNew<String>("UdpReporter"));
  NanAssignPersistent(constructor, ctor);

  // Prototype
  NODE_SET_PROTOTYPE_METHOD(ctor, "sendReport", UdpReporter::sendReport);

  exports->Set(NanNew<String>("UdpReporter"), ctor->GetFunction());
}
