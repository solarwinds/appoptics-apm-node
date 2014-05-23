#ifndef LIBOBOE_H
#define LIBOBOE_H

#ifdef __cplusplus
extern "C" {
#endif

#include <sys/types.h>
#include <inttypes.h>
#include "bson/bson.h"

#define OBOE_SAMPLE_RATE_DEFAULT 300000 // 30%
#define OBOE_SAMPLE_RESOLUTION 1000000

#define OBOE_MAX_TASK_ID_LEN 20
#define OBOE_MAX_OP_ID_LEN 8
#define OBOE_MAX_METADATA_PACK_LEN 512

#define XTR_CURRENT_VERSION 1
#define XTR_UDP_PORT 7831


// structs

typedef struct oboe_ids {
    uint8_t task_id[OBOE_MAX_TASK_ID_LEN];
    uint8_t op_id[OBOE_MAX_OP_ID_LEN];
} oboe_ids_t;

typedef struct oboe_metadata {
    oboe_ids_t  ids;
    size_t      task_len;
    size_t      op_len;
} oboe_metadata_t;

typedef struct oboe_event {
    oboe_metadata_t metadata;
    bson_buffer     bbuf;
    char *          bb_str;
} oboe_event_t;


// oboe_metadata

int oboe_metadata_init      (oboe_metadata_t *);
int oboe_metadata_destroy   (oboe_metadata_t *);

int oboe_metadata_is_valid   (const oboe_metadata_t *);

void oboe_metadata_copy     (oboe_metadata_t *, const oboe_metadata_t *);

void oboe_metadata_random   (oboe_metadata_t *);

int oboe_metadata_set_lengths   (oboe_metadata_t *, size_t, size_t);
int oboe_metadata_create_event  (const oboe_metadata_t *, oboe_event_t *);

int oboe_metadata_tostr     (const oboe_metadata_t *, char *, size_t);
int oboe_metadata_fromstr   (oboe_metadata_t *, const char *, size_t);


// oboe_event

int oboe_event_init     (oboe_event_t *, const oboe_metadata_t *);
int oboe_event_destroy  (oboe_event_t *);

int oboe_event_add_info (oboe_event_t *, const char *, const char *);
int oboe_event_add_info_binary (oboe_event_t *, const char *, const char *, size_t);
int oboe_event_add_info_int64 (oboe_event_t *, const char *, const int64_t);
int oboe_event_add_info_double (oboe_event_t *, const char *, const double);
int oboe_event_add_info_bool (oboe_event_t *, const char *, const int);
int oboe_event_add_info_fmt (oboe_event_t *, const char *key, const char *fmt, ...);
int oboe_event_add_info_bson (oboe_event_t *, const char *key, const bson *val);
int oboe_event_add_edge (oboe_event_t *, const oboe_metadata_t *);
int oboe_event_add_edge_fromstr(oboe_event_t *, const char *, size_t);


// oboe_context

oboe_metadata_t *oboe_context_get();
void oboe_context_set(oboe_metadata_t *);
int oboe_context_set_fromstr(const char *, size_t);

void oboe_context_clear();

int oboe_context_is_valid();


// oboe_reporter

typedef ssize_t (*reporter_send)(void *, const char *, size_t);
typedef int (*reporter_destroy)(void *);

typedef struct oboe_reporter {
    void *              descriptor;
    reporter_send       send;
    reporter_destroy    destroy;
} oboe_reporter_t;

int oboe_reporter_udp_init  (oboe_reporter_t *, const char *, const char *);
int oboe_reporter_file_init (oboe_reporter_t *, const char *);

int oboe_reporter_send(oboe_reporter_t *, oboe_metadata_t *, oboe_event_t *);
int oboe_reporter_destroy(oboe_reporter_t *);
ssize_t oboe_reporter_udp_send(void *desc, const char *data, size_t len);


// initialization

void oboe_init();


// Settings interface

#define OBOE_SETTINGS_VERSION 1
#define OBOE_SETTINGS_MAGIC_NUMBER 0x6f626f65
#define OBOE_SETTINGS_TYPE_SKIP 0
#define OBOE_SETTINGS_TYPE_STOP 1
#define OBOE_SETTINGS_TYPE_DEFAULT_SAMPLE_RATE 2
#define OBOE_SETTINGS_TYPE_LAYER_SAMPLE_RATE 3
#define OBOE_SETTINGS_TYPE_LAYER_APP_SAMPLE_RATE 4
#define OBOE_SETTINGS_TYPE_LAYER_HTTPHOST_SAMPLE_RATE 5
#define OBOE_SETTINGS_TYPE_CONFIG_STRING 6
#define OBOE_SETTINGS_TYPE_CONFIG_INT 7
#define OBOE_SETTINGS_FLAG_OK             0x0
#define OBOE_SETTINGS_FLAG_INVALID        0x1
#define OBOE_SETTINGS_FLAG_OVERRIDE       0x2
#define OBOE_SETTINGS_FLAG_SAMPLE_START   0x4
#define OBOE_SETTINGS_FLAG_SAMPLE_THROUGH 0x8
#define OBOE_SETTINGS_FLAG_SAMPLE_THROUGH_ALWAYS 0x10
#define OBOE_SETTINGS_FLAG_SAMPLE_AVW_ALWAYS     0x20
#define OBOE_SETTINGS_MAX_STRLEN 256

#define OBOE_SETTINGS_UNSET -1
#define OBOE_SETTINGS_MIN_REFRESH_INTERVAL 30

// Value for "SampleSource" info key
// where was the sample rate specified? (oboe settings, config file, hard-coded default, etc)
#define OBOE_SAMPLE_RATE_SOURCE_FILE 1
#define OBOE_SAMPLE_RATE_SOURCE_DEFAULT 2
#define OBOE_SAMPLE_RATE_SOURCE_OBOE 3
#define OBOE_SAMPLE_RATE_SOURCE_LAST_OBOE 4
#define OBOE_SAMPLE_RATE_SOURCE_DEFAULT_MISCONFIGURED 5
#define OBOE_SAMPLE_RATE_SOURCE_OBOE_DEFAULT 6

#define OBOE_SAMPLE_RESOLUTION 1000000

// Used to convert to settings flags:
#define OBOE_TRACE_NEVER   0
#define OBOE_TRACE_ALWAYS  1
#define OBOE_TRACE_THROUGH 2

typedef struct {
    volatile uint32_t magic;
    volatile uint32_t timestamp;
    volatile uint16_t type;
    volatile uint16_t flags;
    volatile uint32_t value;
    uint32_t _pad;
    char layer[OBOE_SETTINGS_MAX_STRLEN];
    char arg[OBOE_SETTINGS_MAX_STRLEN];
} __attribute__((packed)) oboe_settings_t;

// Current settings configuration:
typedef struct {
    int tracing_mode;          // loaded from config file
    int sample_rate;           // loaded from config file
    int default_sample_rate;   // default sample rate (fallback)
    oboe_settings_t *settings; // cached settings, updated by tracelyzer (init to NULL)
    int last_auto_sample_rate; // stores last known automatic sampling rate
    uint16_t last_auto_flags;  // stores last known flags associated with above
    uint32_t last_auto_timestamp; // timestamp from last *settings lookup
    uint32_t last_refresh;        // last refresh time
} oboe_settings_cfg_t;

oboe_settings_t* oboe_settings_get(uint16_t type, const char* layer, const char* arg);
oboe_settings_t* oboe_settings_get_layer_tracing_mode(const char* layer);
oboe_settings_t* oboe_settings_get_layer_sample_rate(const char* layer);
oboe_settings_t* oboe_settings_get_layer_app_sample_rate(const char* layer, const char* app);
uint32_t oboe_settings_get_latest_timestamp(const char* layer);
int oboe_settings_get_value(oboe_settings_t *s, int *outval, unsigned short *outflags, uint32_t *outtimestamp);

oboe_settings_cfg_t* oboe_settings_cfg_get();
void oboe_settings_cfg_init(oboe_settings_cfg_t *cfg);
void oboe_settings_cfg_tracing_mode_set(int new_mode);
void oboe_settings_cfg_sample_rate_set(int new_rate);

/**
 * Check if this request should be sampled (deprecated - use oboe_sample_layer() instead).
 *
 * @param layer Layer name as used in oboe_settings_t.layer (may be NULL to use default settings)
 * @param xtrace X-Trace ID string from an HTTP request or higher layer (NULL or empty string if not present).
 * @param cfg The settings configuration to use for this evaluation.
 * @param sample_rate_out The sample rate used to check if this request should be sampled
 *          (output - may be zero if not used).
 * @param sample_source_out The OBOE_SAMPLE_RATE_SOURCE used to check if this request
 *          should be sampled (output - may be zero if not used).
 * @return Non-zero if the given layer should be sampled.
 */
int oboe_sample_request(const char *layer, const char *in_xtrace, oboe_settings_cfg_t *cfg,
                      int *sample_rate_out, int *sample_source_out);
int oboe_rand_get_value();

/**
 * Check if this request should be sampled.
 *
 * Checks for sample rate flags and settings for the specified layer, considers any
 * special features in the X-Trace and X-TV-Meta HTTP headers, and, if appropriate,
 * rolls the virtual dice to decide if this request should be sampled.
 *
 * This replaces oboe_sample_request with a version that uses the settings
 * configuration kept in thread-local storage and takes the X-TV-Meta HTTP
 * header value in order to support AppView Web integration.
 *
 * @param layer Layer name as used in oboe_settings_t.layer (may be NULL to use default settings)
 * @param xtrace X-Trace ID string from an HTTP request or higher layer (NULL or empty string if not present).
 * @param tv_meta AppView Web ID from X-TV-Meta HTTP header or higher layer (NULL or empty string if not present).
 * @param sample_rate_out The sample rate used to check if this request should be sampled
 *          (output - may be zero if not used).
 * @param sample_source_out The OBOE_SAMPLE_RATE_SOURCE used to check if this request
 *          should be sampled (output - may be zero if not used).
 * @return Non-zero if the given layer should be sampled.
 */
int oboe_sample_layer(
    const char *layer,
    const char *xtrace,
    const char *tv_meta,
    int *sample_rate_out,
    int *sample_source_out
);

/* Oboe configuration interface. */

/**
 * Check if the Oboe library is compatible with a given version.revision.
 *
 * This will succeed if the library is at least as recent as specified and if no
 * definitions have been removed since that revision.
 *
 * @param version The library's version number which increments every time the API changes.
 * @param revision The revision of the current version of the library.
 * @return Non-zero if the Oboe library is considered compatible with the specified revision.
 */
extern int oboe_config_check_version(int version, int revision);

/**
 * Get the Oboe library version number.
 *
 * This number increments whenever the API is changed.
 *
 * @return The library's version number or -1 if the version is not known.
 */
extern int oboe_config_get_version();

/**
 * Get the Oboe library revision number.
 *
 * This is the revision of the current version which is updated whenever
 * compatible changes are made to the API/ABI (ie. additions).
 *
 * @return The library's revision number or -1 if not known.
 */
extern int oboe_config_get_revision();

/*
 * Get the Oboe library version as a string.
 *
 * Returns the complete VERSION string or null
 */
const char* oboe_config_get_version_string();

#ifdef __cplusplus
} // extern "C"
#endif

#endif // LIBOBOE_H
