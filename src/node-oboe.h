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
  // friend class FileReporter;
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
  friend class Metadata;
  friend class Event;

  static void setTracingMode(int);
  static void setDefaultSampleRate(int);
  static int sampleRequest(std::string, std::string, std::string);
  static oboe_metadata_t *get(); // used internally
  static std::string toString();
  static void set(oboe_metadata_t*);
  static void fromString(std::string);
  static Metadata *copy();
  static void clear();
  static bool isValid();
  static void init();
  static Event *createEvent();
  static Event *startTrace();
};

class Event : public node::ObjectWrap {
  friend class UdpReporter;
  // friend class FileReporter;
  friend class OboeContext;
  friend class Metadata;

  explicit Event();
  explicit Event(const oboe_metadata_t*, bool addEdge=true);
  ~Event();

  oboe_event_t event;
  static Persistent<FunctionTemplate> constructor;
  static NAN_METHOD(New);
  static NAN_METHOD(addInfo);
  static NAN_METHOD(addEdge);
  static NAN_METHOD(addEdgeStr);
  static NAN_METHOD(getMetadata);
  static NAN_METHOD(metadataString);
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

class Config {
  static NAN_METHOD(getRevision);
  static NAN_METHOD(getVersion);
  static NAN_METHOD(checkVersion);

  public:
    static void Init(Handle<Object>);
};

#endif  // NODE_OBOE_H_
