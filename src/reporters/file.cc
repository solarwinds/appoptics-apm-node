#include "../node-oboe.h"

using namespace v8;

Persistent<FunctionTemplate> FileReporter::constructor;

// Construct with an address and port to report to
FileReporter::FileReporter(const char *file) {
  oboe_reporter_file_init(&reporter, file);
}

// Remember to cleanup the udp reporter struct when garbage collected
FileReporter::~FileReporter() {
  oboe_reporter_destroy(&reporter);
}

// Transform a string back into a metadata instance
NAN_METHOD(FileReporter::sendReport) {
  NanScope();

  if (args.Length() < 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsObject()) {
    return NanThrowError("Must supply an event instance");
  }

  FileReporter* self = ObjectWrap::Unwrap<FileReporter>(args.This());
  Event* event = ObjectWrap::Unwrap<Event>(args[0]->ToObject());

  oboe_metadata_t *md;
  if (args.Length() == 2 && args[1]->IsObject()) {
    Metadata* metadata = ObjectWrap::Unwrap<Metadata>(args[1]->ToObject());
    md = &metadata->metadata;
  } else {
    md = OboeContext::get();
  }

  int status = oboe_reporter_send(&self->reporter, md, &event->event);
  NanReturnValue(NanNew<Boolean>(status >= 0));
}

// Creates a new Javascript instance
NAN_METHOD(FileReporter::New) {
  NanScope();

  if (!args.IsConstructCall()) {
    return NanThrowError("UdpReporter() must be called as a constructor");
  }

  // Validate arguments
  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsString()) {
    return NanThrowError("Address must be a string");
  }

  String::Utf8Value path(args[0]);
  FileReporter* obj = new FileReporter(*path);

  obj->Wrap(args.This());
  NanReturnValue(args.This());
}

// Wrap the C++ object so V8 can understand it
void FileReporter::Init(Handle<Object> exports) {
	NanScope();

  // Prepare constructor template
  Handle<FunctionTemplate> ctor = NanNew<FunctionTemplate>(New);
  ctor->InstanceTemplate()->SetInternalFieldCount(1);
  ctor->SetClassName(NanNew<String>("UdpReporter"));
  NanAssignPersistent(constructor, ctor);

  // Prototype
  NODE_SET_PROTOTYPE_METHOD(ctor, "sendReport", FileReporter::sendReport);

  exports->Set(NanNew<String>("FileReporter"), ctor->GetFunction());
}
