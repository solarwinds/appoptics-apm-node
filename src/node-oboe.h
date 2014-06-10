#ifndef NODE_OBOE_H_
#define NODE_OBOE_H_

#include <iostream>
#include <string>

#include <node.h>
#include <nan.h>
#include <uv.h>
#include <v8.h>

#include <oboe/oboe.h>

using namespace v8;

class Event;

class Metadata : public node::ObjectWrap {
  friend class UdpReporter;
  friend class FileReporter;
  friend class OboeContext;
  friend class Event;

  ~Metadata();
  Metadata();
  Metadata(oboe_metadata_t*);

  oboe_metadata_t metadata;
  static Persistent<FunctionTemplate> constructor;
  static NAN_METHOD(New);
  static NAN_METHOD(fromString);
  static NAN_METHOD(makeRandom);
  static NAN_METHOD(copy);
  static NAN_METHOD(isValid);
  static NAN_METHOD(toString);
  static NAN_METHOD(createEvent);

  public:
    static void Init(Handle<Object>);
};

class OboeContext {
  friend class UdpReporter;
  friend class FileReporter;
  friend class Metadata;
  friend class Event;

  // used internally
  static oboe_metadata_t *get();

  // V8 conversion
  static NAN_METHOD(setTracingMode);
  static NAN_METHOD(setDefaultSampleRate);
  static NAN_METHOD(sampleRequest);
  static NAN_METHOD(toString);
  static NAN_METHOD(set);
  static NAN_METHOD(copy);
  static NAN_METHOD(clear);
  static NAN_METHOD(isValid);
  static NAN_METHOD(init);
  static NAN_METHOD(createEvent);
  static NAN_METHOD(startTrace);

  public:
    static void Init(Handle<Object>);
};

class Event : public node::ObjectWrap {
  friend class UdpReporter;
  friend class FileReporter;
  friend class OboeContext;
  friend class Metadata;
  friend class Log;

  explicit Event();
  explicit Event(const oboe_metadata_t*, bool);
  ~Event();

  oboe_event_t event;
  static Persistent<FunctionTemplate> constructor;
  static NAN_METHOD(New);
  static NAN_METHOD(addInfo);
  static NAN_METHOD(addEdge);
  static NAN_METHOD(getMetadata);
  static NAN_METHOD(toString);
  static NAN_METHOD(startTrace);

  public:
    static void Init(Handle<Object>);
};

class UdpReporter : public node::ObjectWrap {
  ~UdpReporter();
  UdpReporter(const char*, const char*);

  oboe_reporter_t reporter;
  static Persistent<FunctionTemplate> constructor;
  static NAN_METHOD(New);
  static NAN_METHOD(sendReport);

  public:
    static void Init(Handle<Object>);
};

class FileReporter : public node::ObjectWrap {
  ~FileReporter();
  FileReporter(const char*);

  oboe_reporter_t reporter;
  static Persistent<FunctionTemplate> constructor;
  static NAN_METHOD(New);
  static NAN_METHOD(sendReport);

  public:
    static void Init(Handle<Object>);
};

class Config {
  static NAN_METHOD(getRevision);
  static NAN_METHOD(getVersion);
  static NAN_METHOD(checkVersion);

  public:
    static void Init(Handle<Object>);
};

class Log {
public:
    static void method (const char *msg) {
      printf("%s:\n", msg);
    }

    static void event (const char *msg, Event* e) {
      printf("%s:\n", msg);
      event(&e->event);
    }

    static void event (Event* e) {
      event(&e->event);
    }

    static void event (oboe_event_t *e) {
      bson_buffer* buf = &e->bbuf;

      // Print the bson_buffer contents as json
      printf("oboe_event_t {\n");
      printf("  char* buf = \"%s\";\n", buf->buf);
      printf("  char* cur = \"%s\";\n", buf->cur);
      printf("  int bufSize = %d;\n", buf->bufSize);
      printf("  int stackPos = %d;\n", buf->stackPos);
      printf("  bson_bool_t finished = %d;\n", buf->finished);
      printf("  int stack[32] = [\n");
      int i;
      for (i = 0; i < 32; i++) {
         printf("    %d,\n", buf->stack[i]);
      }
      printf("  ];\n");
      printf("}\n\n");

      bson b;
      bson_from_buffer(&b, buf);
      bson_print(&b);

      printf("\n");
    }

    static void metadata (const char *msg, const oboe_metadata_t *m) {
      printf("%s:\n", msg);
      metadata(m);
    }

    static void metadata (const oboe_metadata_t *m) {
      int task_len = m->task_len;
      int op_len = m->op_len;
      int i;

      // Print the bson_buffer contents as json
      printf("oboe_metadata_t {\n");
      printf("  size_t task_len = %d;\n", task_len);
      printf("  size_t op_len = %d;\n", op_len);
      printf("  oboe_ids_t ids = {\n");
      printf("    uint8_t task_id[%d] = [\n", task_len);
      for (i = 0; i < task_len; i++) {
         printf("      %d,\n", m->ids.task_id[i]);
      }
      printf("    ]\n");
      printf("    uint8_t op_id[%d] = [\n", op_len);
      for (i = 0; i < op_len; i++) {
         printf("      %d,\n", m->ids.op_id[i]);
      }
      printf("    ]\n");
      printf("}\n");

      printf("\n");
    }
};

#endif  // NODE_OBOE_H_
