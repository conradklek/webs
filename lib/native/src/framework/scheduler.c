#include "scheduler.h"
#include "engine.h"
#include <stdlib.h>
#include <string.h>

static int compare_effects(const void *a, const void *b) {
  ReactiveEffect *effect_a = *(ReactiveEffect **)a;
  ReactiveEffect *effect_b = *(ReactiveEffect **)b;
  if (effect_a < effect_b)
    return -1;
  if (effect_a > effect_b)
    return 1;
  return 0;
}

Scheduler *scheduler() {
  Scheduler *scheduler = calloc(1, sizeof(Scheduler));
  if (!scheduler) {
    return NULL;
  }
  scheduler->queue_capacity = 16;
  scheduler->queue =
      malloc(sizeof(ReactiveEffect *) * scheduler->queue_capacity);
  if (!scheduler->queue) {
    free(scheduler);
    return NULL;
  }
  return scheduler;
}

void scheduler_destroy(Scheduler *scheduler) {
  if (scheduler) {
    free(scheduler->queue);
    free(scheduler);
  }
}

void scheduler_queue_job(Scheduler *scheduler, ReactiveEffect *job) {
  if (!scheduler || !job) {
    return;
  }

  for (size_t i = 0; i < scheduler->queue_size; i++) {
    if (scheduler->queue[i] == job) {
      return;
    }
  }

  if (scheduler->queue_size >= scheduler->queue_capacity) {
    scheduler->queue_capacity *= 2;
    ReactiveEffect **new_queue = realloc(
        scheduler->queue, sizeof(ReactiveEffect *) * scheduler->queue_capacity);
    if (!new_queue) {
      return;
    }
    scheduler->queue = new_queue;
  }

  scheduler->queue[scheduler->queue_size++] = job;
}

void scheduler_flush_jobs(Engine *engine, Scheduler *scheduler) {
  if (!engine || !scheduler || scheduler->is_flushing) {
    return;
  }

  scheduler->is_flushing = true;

  qsort(scheduler->queue, scheduler->queue_size, sizeof(ReactiveEffect *),
        compare_effects);

  for (size_t i = 0; i < scheduler->queue_size; i++) {
    ReactiveEffect *job = scheduler->queue[i];
    if (job) {
      effect_run(engine, job);
    }
  }

  scheduler->queue_size = 0;

  scheduler->is_flushing = false;
}
