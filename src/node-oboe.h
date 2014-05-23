#ifndef NODE_OBOE_H_
#define NODE_OBOE_H_

// Disable some warnings only for the node headers.
#if defined(__GNUC__)
# pragma GCC diagnostic ignored "-Wunused-parameter"
# if __GNUC__ > 4 || __GNUC__ == 4 && __GNUC_MINOR__ >= 8
#  pragma GCC diagnostic ignored "-Wunused-local-typedefs"
# endif
#endif

#include "node_version.h"
#include "node.h"
#include "uv.h"
#include "v8.h"

#if defined(__GNUC__)
# pragma GCC diagnostic warning "-Wunused-parameter"
# if __GNUC__ > 4 || __GNUC__ == 4 && __GNUC_MINOR__ >= 8
#  pragma GCC diagnostic warning "-Wunused-local-typedefs"
# endif
#endif

// Do not support old versions
#if NODE_MAJOR_VERSION == 0 && NODE_MINOR_VERSION >= 11
# define NODE_VER 12
#elif NODE_MAJOR_VERSION == 0 && NODE_MINOR_VERSION == 10
# define NODE_VER 10
#else
# error "Unsupported node.js version."
#endif

#include "oboe.h"

namespace appneta {
  namespace oboe {
    // class Metadata;
    // class Context;
    // class Event;
    // class Config;
    // class UdpReporter;
    // class FileReporter;

    namespace config { void Init(v8::Isolate*, v8::Local<v8::Object>); }
  }  // namespace oboe
}  // namespace appneta

#endif  // NODE_OBOE_H_
