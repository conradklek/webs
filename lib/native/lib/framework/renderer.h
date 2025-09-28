#ifndef RENDERER_H
#define RENDERER_H

#include "../core/value.h"
#include "vdom.h"

VNode *render_template(const Value *template_ast, const Value *context);

#endif
