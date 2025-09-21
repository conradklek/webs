#ifndef WEBS_JSON_H
#define WEBS_JSON_H

#include <stddef.h>
#include <stdbool.h>

typedef struct {
    char *data, *cur, *end;
    int depth;
    char *error;
} webs_json_Reader;

typedef struct {
    int type;
    char *start, *end;
    int depth;
} webs_json_Value;

enum { WEBS_JSON_ERROR, WEBS_JSON_END, WEBS_JSON_ARRAY, WEBS_JSON_OBJECT, WEBS_JSON_NUMBER, WEBS_JSON_STRING, WEBS_JSON_BOOL, WEBS_JSON_NULL };

webs_json_Reader webs_json_reader(char *data, size_t len);
webs_json_Value webs_json_read(webs_json_Reader *r);
bool webs_json_iter_array(webs_json_Reader *r, webs_json_Value arr, webs_json_Value *val);
bool webs_json_iter_object(webs_json_Reader *r, webs_json_Value obj, webs_json_Value *key, webs_json_Value *val);
void webs_json_location(webs_json_Reader *r, int *line, int *col);

#endif

#ifdef WEBS_JSON_IMPL

webs_json_Reader webs_json_reader(char *data, size_t len) {
    return (webs_json_Reader){ .data = data, .cur = data, .end = data + len };
}

static bool webs_json__is_number_cont(char c) {
    return (c >= '0' && c <= '9')
        ||  c == 'e' || c == 'E' || c == '.' || c == '-' || c == '+';
}

static bool webs_json__is_string(char *cur, char *end, char *expect) {
    while (*expect) {
        if (cur == end || *cur != *expect) {
            return false;
        }
        expect++, cur++;
    }
    return true;
}

webs_json_Value webs_json_read(webs_json_Reader *r) {
    webs_json_Value res;
top:
    if (r->error) { return (webs_json_Value){ .type = WEBS_JSON_ERROR, .start = r->cur, .end = r->cur }; }
    if (r->cur == r->end) { r->error = "unexpected eof"; goto top; }
    res.start = r->cur;

    switch (*r->cur) {
    case ' ': case '\n': case '\r': case '\t': case '\v':
    case ':': case ',':
        r->cur++;
        goto top;

    case '-': case '0': case '1': case '2': case '3': case '4':
    case '5': case '6': case '7': case '8': case '9':
        res.type = WEBS_JSON_NUMBER;
        while (r->cur != r->end && webs_json__is_number_cont(*r->cur)) { r->cur++; }
        break;

    case '"':
        res.type = WEBS_JSON_STRING;
        res.start = ++r->cur;
        for (;;) {
            if ( r->cur == r->end) { r->error = "unclosed string"; goto top; }
            if (*r->cur == '"') { break; }
            if (*r->cur == '\\') { r->cur++; }
            if ( r->cur != r->end) { r->cur++; }
        }
        res.end = r->cur++;
        return res;

    case '{': case '[':
        res.type = (*r->cur == '{') ? WEBS_JSON_OBJECT : WEBS_JSON_ARRAY;
        res.depth = ++r->depth;
        r->cur++;
        break;

    case '}': case ']':
        res.type = WEBS_JSON_END;
        if (--r->depth < 0) {
            r->error = (*r->cur == '}') ? "stray '}'" : "stray ']'";
            goto top;
        }
        r->cur++;
        break;

    case 'n': case 't': case 'f':
        res.type = (*r->cur == 'n') ? WEBS_JSON_NULL : WEBS_JSON_BOOL;
        if (webs_json__is_string(r->cur, r->end,  "null")) { r->cur += 4; break; }
        if (webs_json__is_string(r->cur, r->end,  "true")) { r->cur += 4; break; }
        if (webs_json__is_string(r->cur, r->end, "false")) { r->cur += 5; break; }

    default:
        r->error = "unknown token";
        goto top;
    }
    res.end = r->cur;
    return res;
}

static void webs_json__discard_until(webs_json_Reader *r, int depth) {
    webs_json_Value val;
    val.type = WEBS_JSON_NULL;
    while (r->depth != depth && val.type != WEBS_JSON_ERROR) {
        val = webs_json_read(r);
    }
}

bool webs_json_iter_array(webs_json_Reader *r, webs_json_Value arr, webs_json_Value *val) {
    webs_json__discard_until(r, arr.depth);
    *val = webs_json_read(r);
    if (val->type == WEBS_JSON_ERROR || val->type == WEBS_JSON_END) { return false; }
    return true;
}

bool webs_json_iter_object(webs_json_Reader *r, webs_json_Value obj, webs_json_Value *key, webs_json_Value *val) {
    webs_json__discard_until(r, obj.depth);
    *key = webs_json_read(r);
    if (key->type == WEBS_JSON_ERROR || key->type == WEBS_JSON_END) { return false; }
    *val = webs_json_read(r);
    if (val->type == WEBS_JSON_END)   { r->error = "unexpected object end"; return false; }
    if (val->type == WEBS_JSON_ERROR) { return false; }
    return true;
}

void webs_json_location(webs_json_Reader *r, int *line, int *col) {
    int ln = 1, cl = 1;
    for (char *p = r->data; p != r->cur; p++) {
        if (*p == '\n') { ln++; cl = 0; }
        cl++;
    }
    *line = ln;
    *col = cl;
}

#endif

