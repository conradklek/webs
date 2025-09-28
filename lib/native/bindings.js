import { FFIType } from 'bun:ffi';

export const symbols = {
  webs_number: { args: [FFIType.double], returns: FFIType.ptr },
  webs_boolean: { args: [FFIType.bool], returns: FFIType.ptr },
  webs_null: { args: [], returns: FFIType.ptr },
  webs_undefined: { args: [], returns: FFIType.ptr },
  webs_pointer: { args: [FFIType.ptr], returns: FFIType.ptr },
  webs_string: { args: [FFIType.ptr], returns: FFIType.ptr },
  webs_string_trim_start: { args: [FFIType.ptr], returns: FFIType.ptr },
  webs_string_trim_end: { args: [FFIType.ptr], returns: FFIType.ptr },
  webs_string_trim: { args: [FFIType.ptr], returns: FFIType.ptr },
  webs_array: { args: [], returns: FFIType.ptr },
  webs_array_push: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.int },
  webs_object: { args: [], returns: FFIType.ptr },
  webs_object_set: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.int,
  },
  webs_regex_parse: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },

  webs_dom_create_element: { args: [FFIType.ptr], returns: FFIType.ptr },
  webs_dom_free_node: { args: [FFIType.ptr], returns: FFIType.void },
  webs_dom_append_child: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.void,
  },
  webs_dom_set_attribute: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.void,
  },
  webs_dom_add_event_listener: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.void,
  },
  webs_event_dispatch_click: { args: [FFIType.ptr], returns: FFIType.void },

  ref: { args: [FFIType.ptr], returns: FFIType.ptr },
  ref_get_value: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
  ref_set_value: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.void,
  },
  reactive: { args: [FFIType.ptr], returns: FFIType.ptr },
  reactive_get: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  reactive_set: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.void,
  },
  effect: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
  effect_run: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.void },
  effect_free: { args: [FFIType.ptr], returns: FFIType.void },
  webs_scheduler_flush_jobs: { args: [FFIType.ptr], returns: FFIType.void },

  webs_wson_encode: { args: [FFIType.ptr], returns: FFIType.ptr },
  webs_wson_decode: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },

  webs_engine_api: {
    args: [],
    returns: FFIType.ptr,
  },
  webs_engine_destroy_api: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  webs_engine_register_component: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.void,
  },
  webs_set_log_level: {
    args: [FFIType.int],
    returns: FFIType.void,
  },
  webs_create_instance: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_destroy_instance: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  webs_mount_component: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  webs_unmount_component: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  webs_render_to_string: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_ssr: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_render_vdom: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },

  webs_h: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_free_vnode: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  webs_diff: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },

  webs_query_json: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_json_parse: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_json_encode: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_url_decode: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_match_route: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_parse_http_request: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_parse_template: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_parse_expression: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },

  webs_db_open: { args: [FFIType.ptr], returns: FFIType.ptr },
  webs_db_close: { args: [FFIType.ptr], returns: FFIType.ptr },
  webs_db_exec: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
  webs_db_query: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },

  webs_free_string: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  webs_free_value: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },

  webs_read_file: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_write_file: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_file_exists: {
    args: [FFIType.ptr],
    returns: FFIType.bool,
  },
  webs_delete_file: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_dir: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_delete_dir: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_list_dir: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_rename_path: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_stat_path: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_glob: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },

  webs_bundle: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },

  webs_fetch: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  webs_server: {
    args: [FFIType.ptr, FFIType.int],
    returns: FFIType.ptr,
  },
  webs_server_listen: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.int,
  },
  webs_server_stop: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  webs_server_destroy: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  webs_server_write_response: {
    args: [FFIType.int, FFIType.ptr],
    returns: FFIType.void,
  },
  webs_http_stream_begin: {
    args: [FFIType.int, FFIType.int, FFIType.ptr],
    returns: FFIType.void,
  },
  webs_http_stream_write_chunk: {
    args: [FFIType.int, FFIType.ptr, FFIType.u64],
    returns: FFIType.void,
  },
  webs_http_stream_end: {
    args: [FFIType.int],
    returns: FFIType.void,
  },
  webs_static_server: {
    args: [FFIType.ptr, FFIType.int, FFIType.ptr],
    returns: FFIType.int,
  },
};
