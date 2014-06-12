#include "node-oboe.h"

Persistent<FunctionTemplate> Event::constructor;

// Construct a blank event from the context metadata
Event::Event() {
  oboe_event_init(&event, OboeContext::get());
}

// Construct a new event point an edge at another
Event::Event(const oboe_metadata_t *md, bool addEdge) {
  // both methods copy metadata from md -> this
  if (addEdge) {
    // create_event automatically adds edge in event to md
    oboe_metadata_create_event(md, &event);
  } else {
    // initializes new Event with this md's task_id & new random op_id; no edges set
    oboe_event_init(&event, md);
  }
}

// Remember to cleanup the struct when garbage collected
Event::~Event() {
  oboe_event_destroy(&event);
}

// Add info to the event
NAN_METHOD(Event::addInfo) {
  NanScope();

  // Validate arguments
  if (args.Length() != 2) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsString()) {
    return NanThrowTypeError("Key must be a string");
  }
  if (!args[1]->IsString() && !args[1]->IsNumber()) {
    return NanThrowTypeError("Value must be a string or number");
  }

  // Unwrap event instance from V8
  Event* self = ObjectWrap::Unwrap<Event>(args.This());
  oboe_event_t* event = &self->event;

  // Get key string from arguments and prepare a status variable
  String::Utf8Value v8_key(args[0]);
  const char* key = *v8_key;

  // Handle number values
  if (args[1]->IsNumber()) {
    const double val = args[1]->NumberValue();
    oboe_event_add_info_double(event, key, val);

  // Handle string values
  } else {
    // Get value string from arguments
    String::Utf8Value v8_val(args[1]);
    char* val = *v8_val;
    int len = strlen(val);

    // Detect if we should add as binary or a string
    // TODO: Should probably use buffers for binary data...
    if (memchr(val, '\0', len)) {
      oboe_event_add_info_binary(event, key, val, len);
    } else {
      oboe_event_add_info(event, key, val);
    }
  }

  NanReturnUndefined();
}

// Add an edge from a metadata instance
NAN_METHOD(Event::addEdge) {
  NanScope();

  // Validate arguments
  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsObject() && !args[0]->IsString()) {
    return NanThrowTypeError("Must supply an edge metadata instance or string");
  }

  // Unwrap event instance from V8
  Event* self = ObjectWrap::Unwrap<Event>(args.This());

  if (args[0]->IsObject()) {
    // Unwrap metadata instance from arguments
    Metadata* metadata = ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());

    // Attempt to add the edge
    oboe_event_add_edge(&self->event, &metadata->metadata);
  } else {
    // Get string data from arguments
    String::Utf8Value v8_val(args[0]);
    std::string val(*v8_val);

    // Attempt to add edge
    int status = oboe_event_add_edge_fromstr(&self->event, val.c_str(), val.size());
    printf("status is: %d\n", status);
    printf("v8 val is: %s\n", *v8_val);
    printf("val is: %s\n", val.c_str());
  }

  NanReturnUndefined();
}

// Get the metadata of an event
NAN_METHOD(Event::getMetadata) {
  NanScope();

  // Unwrap event instance from V8
  Event* self = ObjectWrap::Unwrap<Event>(args.This());
  oboe_event_t* event = &self->event;

  // Make an empty object template with space for internal field pointers
  Handle<ObjectTemplate> t = NanNew<ObjectTemplate>();
  t->SetInternalFieldCount(2);

  // Construct an object with our internal field pointer
  Local<Object> obj = t->NewInstance();

  // Attach the internal field pointer
  NanSetInternalFieldPointer(obj, 1, (void *) &event->metadata);

  // Use the object as an argument in the event constructor
  Handle<Value> argv[1] = { obj };
  NanReturnValue(NanNew(Metadata::constructor)->GetFunction()->NewInstance(1, argv));
}

// Get the metadata of an event as a string
NAN_METHOD(Event::toString) {
  NanScope();

  // Unwrap the event instance from V8
  Event* self = ObjectWrap::Unwrap<Event>(args.This());

  // Get a pointer to the event struct
  oboe_event_t* event = &self->event;

  // Build a character array from the event metadata content
  char buf[OBOE_MAX_METADATA_PACK_LEN];
  int rc = oboe_metadata_tostr(&event->metadata, buf, sizeof(buf) - 1);

  // If we have data, return it as a string
  if (rc == 0) {
    NanReturnValue(NanNew<String>(buf));

  // Otherwise, return an empty string
  } else {
    NanReturnEmptyString();
  }
}

// Start tracing using supplied metadata
NAN_METHOD(Event::startTrace) {
  NanScope();

  // Validate arguments
  if (args.Length() != 1) {
    return NanThrowError("Wrong number of arguments");
  }
  if (!args[0]->IsObject()) {
    return NanThrowTypeError("Must supply a metadata instance");
  }

  // Unwrap metadata from arguments
  Metadata* metadata = ObjectWrap::Unwrap<Metadata>(args[0]->ToObject());

  // Make an empty object template with space for internal field pointers
	Handle<ObjectTemplate> t = NanNew<ObjectTemplate>();
	t->SetInternalFieldCount(2);

  // Construct an object with our internal field pointer
	Local<Object> obj = t->NewInstance();

  // Attach the internal field pointer
  NanSetInternalFieldPointer(obj, 1, (void *) &metadata->metadata);

  // Use the object as an argument in the event constructor
  Handle<Value> argv[2] = { obj, NanNew<Boolean>(false) };
  NanReturnValue(NanNew(Event::constructor)->GetFunction()->NewInstance(2, argv));
}

// Creates a new Javascript instance
NAN_METHOD(Event::New) {
  NanScope();

  if (!args.IsConstructCall()) {
    return NanThrowError("Event() must be called as a constructor");
  }

  Event* event;
  if (args.Length() > 0) {
    void* ptr = NanGetInternalFieldPointer(args[0].As<Object>(), 1);
    oboe_metadata_t* context = static_cast<oboe_metadata_t*>(ptr);

    bool addEdge = true;
    if (args.Length() == 2 && args[1]->IsBoolean()) {
      addEdge = args[1]->BooleanValue();
    }

    event = new Event(context, addEdge);
  } else {
    event = new Event();
  }

  event->Wrap(args.This());
  NanSetInternalFieldPointer(args.This(), 1, &event->event);
	NanReturnValue(args.This());
}

// Wrap the C++ object so V8 can understand it
void Event::Init(Handle<Object> exports) {
	NanScope();

  // Prepare constructor template
  Handle<FunctionTemplate> ctor = NanNew<FunctionTemplate>(New);
  ctor->InstanceTemplate()->SetInternalFieldCount(2);
  ctor->SetClassName(NanNew<String>("Event"));
  NanAssignPersistent(constructor, ctor);

  // Statics
  NODE_SET_METHOD(ctor, "startTrace", Event::startTrace);

  // Prototype
  NODE_SET_PROTOTYPE_METHOD(ctor, "addInfo", Event::addInfo);
  NODE_SET_PROTOTYPE_METHOD(ctor, "addEdge", Event::addEdge);
  NODE_SET_PROTOTYPE_METHOD(ctor, "getMetadata", Event::getMetadata);
  NODE_SET_PROTOTYPE_METHOD(ctor, "toString", Event::toString);

  exports->Set(NanNew<String>("Event"), ctor->GetFunction());
}
