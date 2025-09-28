#ifndef SCHEDULER_H
#define SCHEDULER_H

#include "reactivity.h"
#include <stdbool.h>

typedef struct Scheduler {
  ReactiveEffect **queue;
  size_t queue_size;
  size_t queue_capacity;
  bool is_flushing;
} Scheduler;

Scheduler *scheduler();
void scheduler_destroy(Scheduler *scheduler);
void scheduler_queue_job(Scheduler *scheduler, ReactiveEffect *job);
void scheduler_flush_jobs(Engine *engine, Scheduler *scheduler);

#endif
