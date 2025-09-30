/**
 * @file scheduler.h
 * @brief Defines the scheduler for batching reactive effect updates.
 *
 * When multiple reactive dependencies change in a single synchronous operation,
 * the scheduler ensures that dependent effects (like re-rendering) are queued
 * and run only once, preventing unnecessary work.
 */

#ifndef SCHEDULER_H
#define SCHEDULER_H

#include "reactivity.h"
#include <stdbool.h>

/**
 * @struct Scheduler
 * @brief Manages a queue of reactive effects to be run.
 */
typedef struct Scheduler {
  ReactiveEffect **queue;
  size_t queue_size;
  size_t queue_capacity;
  bool is_flushing;
} Scheduler;

/**
 * @brief Creates a new scheduler instance.
 * @return A new `Scheduler`, or NULL on failure.
 */
Scheduler *scheduler();

/**
 * @brief Frees a scheduler instance.
 * @param scheduler The scheduler to destroy.
 */
void scheduler_destroy(Scheduler *scheduler);

/**
 * @brief Adds a reactive effect to the queue to be run.
 * @param scheduler The scheduler instance.
 * @param job The `ReactiveEffect` to queue.
 */
void scheduler_queue_job(Scheduler *scheduler, ReactiveEffect *job);

/**
 * @brief Runs all the effects currently in the queue.
 * @param engine The framework engine instance.
 * @param scheduler The scheduler instance.
 */
void scheduler_flush_jobs(Engine *engine, Scheduler *scheduler);

#endif // SCHEDULER_H
