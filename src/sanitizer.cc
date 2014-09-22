#include "node-oboe.h"
#include <iostream>

#include <ctype.h>
#include <limits.h>
#include <stddef.h>
#include <stdio.h>

using namespace v8;

#define OBOE_SQLSANITIZE_AUTO       1   /*!< Enable SQL sanitizer - automatic configuration */
#define OBOE_SQLSANITIZE_DROPDOUBLE 2   /*!< Enable SQL sanitizer - drop double-quoted text (overrides KEEP) */
#define OBOE_SQLSANITIZE_KEEPDOUBLE 4   /*!< Enable SQL sanitizer - keep double-quoted text (overrides AUTO) */

#define SANIFLAG_DROP_DOUBLEQUOTED      1       /*!< Forces double-quoted text to be dropped. */
#define SANIFLAG_ENABLE_DIAGNOSTICS  1024       /*!< Enable diagnostic trace - must be compiled with -DENABLE_DIAGNOSTICS=1 */

#define UNLOADED_TABLE 999

#define COPY_CURRENT_CHARACTER \
    *pout++ = curchar;

#define COPY_DELETED_MARKER \
    *pout++ = '?';

#define COPY_THIS_CHARACTER(c) \
    *pout++ = (c);

#define LOAD_NEXT_CHARACTER \
    curchar = *pin++;

#define REPLAY_CURRENT_CHARACTER \
    --pin;

#define DROP_DOUBLE_QUOTED \
    (saniflags & SANIFLAG_DROP_DOUBLEQUOTED)

#define DIAGNOSTICS_ENABLED \
    (saniflags & SANIFLAG_ENABLE_DIAGNOSTICS)

static const char *SanitizeStdSql_StateNames[] = {
    "copy",
    "copy/escape",
    "string/start",
    "string/body",
    "string/escape",
    "string/end_start",
    "string/end_body",
    "number",
    "ident/escape",
    "quoted-ident",
    "identifier"
};
#define GetSanitizeStdSqlStateName(n) \
    ((n) >= (sizeof(SanitizeStdSql_StateNames) / sizeof(SanitizeStdSql_StateNames[0])) ? "???" : SanitizeStdSql_StateNames[n])

/*
 * A FSM that obfuscates value strings and numbers in captured standard SQL queries.
 *
 * Note that this function interface requires a strict non-expansion constraint so that
 * we don't risk writing beyond the end of the sql buffer.
 */
size_t oboe_sanitize_sql(char *sql, size_t in_len, int saniflags) {
    char curchar = 0;
    char quotechar = '\'';
    char *pend = sql + in_len;
    /* Abort by setting input pointer to the end if our SQL input is a NULL pointer. */
    char *pin = (sql == 0 ? pend : sql);            /* Input pointer. */
    char *pout = sql;                               /* Output pointer. */
    enum fsm_state {
        FSM_COPY,               /*!< Copying input directly - default state. */
        FSM_COPY_ESCAPE,        /*!< Copying an escaped character code. */
        FSM_STRING_START,       /*!< Parsing an opening quote for a string. */
        FSM_STRING_BODY,        /*!< Parsing a string body. */
        FSM_STRING_ESCAPE,      /*!< Parsing an escape code in a string body. */
        FSM_STRING_END_START,   /*!< Parsing a possible closing quote at beginning of string. */
        FSM_STRING_END_BODY,    /*!< Parsing a possible closing quote in a string body. */
        FSM_NUMBER,             /*!< Parsing a numeric literal. */
        FSM_IDENTIFIER_ESCAPE,  /*!< Parsing an escaped character in a quoted identifier. */
        FSM_IDENTIFIER_QUOTED,  /*!< Parsing a quoted identifier. */
        FSM_IDENTIFIER          /*!< Parsing an unquoted identifier. */
    } curstate = FSM_COPY;
    enum fsm_state prevstate = curstate;

    /* Some character encoding methods may contain zero bytes so we don't check for NULL terminators. */
    while (pin < pend) {
        if (curstate != prevstate && DIAGNOSTICS_ENABLED) {
            printf("oboe_sanitize_sql: New state=%s(%d) on char@%ld='%c'\n",
                    GetSanitizeStdSqlStateName(curstate), curstate, pin - sql - 1, curchar);
            prevstate = curstate;
        }

        LOAD_NEXT_CHARACTER

        switch (curstate) {

        case FSM_STRING_START:
            /* Handle any special string opening conditions. */
            if (curchar == quotechar) {
                curstate = FSM_STRING_END_START;
            } else if (curchar == '\\') {
                COPY_DELETED_MARKER
                curstate = FSM_STRING_ESCAPE;
            } else {
                /* The string is not an empty one so we can insert a single-character
                 * deleted-text marker to indicate that we've sanitized it, without
                 * violating our strict input compression constraint.
                 */
                COPY_DELETED_MARKER
                curstate = FSM_STRING_BODY;
            }
            break;

        case FSM_STRING_BODY:
            if (curchar == quotechar) {
                if (pin == pend) {
                    /* Special handling for a closing quote at the end of
                     * the input string since we won't be checking if the
                     * quote is twinned (ie. escaped) by a trailing character. */
                    COPY_CURRENT_CHARACTER
                    curstate = FSM_COPY;
                } else {
                    curstate = FSM_STRING_END_BODY;
                }
            } else if (curchar == '\\') {
                curstate = FSM_STRING_ESCAPE;
            } else {
                /* Do nothing - we're dropping the character. */
            }
            break;

        case FSM_STRING_ESCAPE:
            /* Whatever the current character is, drop it. */
            curstate = FSM_STRING_BODY;
            break;

        case FSM_STRING_END_START:
            /* Check if we've reached the end of the string. */
            if (curchar == quotechar) {
                /* We got a twinned quote so it's part of the body - so drop it
                 * but since we're at the beginning of a string we have room
                 * to insert the deleted-string marker. */
                COPY_DELETED_MARKER
                curstate = FSM_STRING_BODY;
            } else {
                COPY_THIS_CHARACTER(quotechar)
                REPLAY_CURRENT_CHARACTER
                curstate = FSM_COPY;
            }
            break;

        case FSM_STRING_END_BODY:
            /* Check if we've reached the end of the string. */
            if (curchar == quotechar) {
                /* We got a twinned quote so it's part of the body - drop it. */
                curstate = FSM_STRING_BODY;
            } else {
                /* We've read one character past the end of the string
                 * so close the string and replay the current character
                 * in the default state. */
                COPY_THIS_CHARACTER(quotechar)
                REPLAY_CURRENT_CHARACTER
                curstate = FSM_COPY;
            }
            break;

        case FSM_COPY_ESCAPE:
            /* Whatever the current character is, copy it. */
            COPY_CURRENT_CHARACTER
            curstate = FSM_COPY;
            break;

        case FSM_NUMBER:
            /* Drop digits, then return to the default state. This will handle
             * tokens that have single character separators, such as numeric
             * fractions, times, and dates, without trying to treat it as part
             * of an identifier.  Anything else would not be valid SQL, I think. */
            if (!isdigit(curchar)) {
                COPY_CURRENT_CHARACTER
                curstate = FSM_COPY;
            }
            break;

        case FSM_IDENTIFIER_ESCAPE:
            /* Whatever the current character is, copy it. This is mostly to
             * ignore embedded quotation marks. */
            COPY_CURRENT_CHARACTER
            curstate = FSM_IDENTIFIER_QUOTED;
            break;

        case FSM_IDENTIFIER_QUOTED:
            COPY_CURRENT_CHARACTER
            if (curchar == '\\') {
                curstate = FSM_IDENTIFIER_ESCAPE;
            } else if (curchar == quotechar) {
                /* Since we are keeping identifiers intact we'll treat twinned
                 * quotation marks as end/start quotes and echo them so we don't
                 * need to check for that case here as we do for string literals.
                 * So no end-quote state needed.
                 */
                curstate = FSM_COPY;
            }
            break;

        case FSM_IDENTIFIER:
            /* We're probably parsing a regular (ie. unquoted) identifier but
             * we might be parsing the prefix on a literal character, binary,
             * or hexidecimal string so we need to be ready to switch to the
             * string parsing state.
             */
            if (curchar == '\'' || (curchar == '\"' && DROP_DOUBLE_QUOTED)) {
                /* Start of a string - identifier is probably a string encoding prefix. */
                COPY_CURRENT_CHARACTER
                quotechar = curchar;
                curstate = FSM_STRING_START;
            } else if (isspace(curchar) || ispunct(curchar)) {
                /* We've passed the end of the identifier so return to the
                 * default parsing state. */
                REPLAY_CURRENT_CHARACTER
                curstate = FSM_COPY;
            } else {
                COPY_CURRENT_CHARACTER
            }
            break;

        case FSM_COPY:
        default:
            if (isalpha(curchar) || curchar == '_') {
                /* Start of an unquoted identifier. */
                COPY_CURRENT_CHARACTER
                curstate = FSM_IDENTIFIER;
            } else if (isdigit(curchar)) {
                /* Start of a numeric literal. */
                COPY_THIS_CHARACTER('0')
                curstate = FSM_NUMBER;
            } else if (curchar == '\'') {
                /* Start of a single-quoted string (MySQL). */
                COPY_CURRENT_CHARACTER
                quotechar = curchar;
                curstate = FSM_STRING_START;
            } else if (curchar == '\"') {
                if (DROP_DOUBLE_QUOTED) {
                    /* Start of a double quoted string. */
                    COPY_CURRENT_CHARACTER
                    quotechar = curchar;
                    curstate = FSM_STRING_START;
                } else {
                    /* Start of a quoted identifier. */
                    COPY_CURRENT_CHARACTER
                    quotechar = curchar;
                    curstate = FSM_IDENTIFIER_QUOTED;
                }
            } else if (curchar == '`') {
                /* Start of a quoted identifier (MySQL). */
                COPY_CURRENT_CHARACTER
                quotechar = curchar;
                curstate = FSM_IDENTIFIER_QUOTED;
            } else if (curchar == '\\') {
                COPY_CURRENT_CHARACTER
                curstate = FSM_COPY_ESCAPE;
            } else {
                COPY_CURRENT_CHARACTER
            }
            break;
        }
    }

    /* Add NULL terminator. */
    *pout = '\0';

    return pout - sql;
}

NAN_METHOD(Sanitizer::sanitize) {
  NanScope();

  if (args.Length() < 1) {
    return NanThrowError("Wrong number of arguments");
  }

  String::Utf8Value v8_str(args[0]);
  const char* input = *v8_str;

  int flag = OBOE_SQLSANITIZE_AUTO;

  if (args.Length() == 2) {
    flag = args[1]->Int32Value();
  }

  char* output = strndup(input, strlen(input));
  oboe_sanitize_sql(output, strlen(input), flag);
  NanReturnValue(NanNew<String>(output));
}

// Wrap the C++ object so V8 can understand it
void Sanitizer::Init(Handle<Object> module) {
  NanScope();

  Local<Object> exports = NanNew<Object>();

  exports->Set(NanNew<String>("OBOE_SQLSANITIZE_AUTO"), NanNew<Uint32>(OBOE_SQLSANITIZE_AUTO));
  exports->Set(NanNew<String>("OBOE_SQLSANITIZE_DROPDOUBLE"), NanNew<Uint32>(OBOE_SQLSANITIZE_DROPDOUBLE));
  exports->Set(NanNew<String>("OBOE_SQLSANITIZE_KEEPDOUBLE"), NanNew<Uint32>(OBOE_SQLSANITIZE_KEEPDOUBLE));

  NODE_SET_METHOD(exports, "sanitize", Sanitizer::sanitize);

  module->Set(NanNew<String>("Sanitizer"), exports);
}
