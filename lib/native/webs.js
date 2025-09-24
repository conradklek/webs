import { FFIType } from 'bun:ffi';

export const symbols = {
  webs_query_json: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_free_string: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  webs_parse_json: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_json_encode: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_free_value: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
};
