import { createLogger } from '../developer/logger.js';

const logger = createLogger('[Errors]');

/**
 * A custom error class for AI-related operations.
 * @class AIError
 * @extends {Error}
 * @property {Error | null} originalError - The original error that was caught, if any.
 */
export class AIError extends Error {
  /**
   * Creates an instance of AIError.
   * @param {string} message - The error message.
   * @param {Error | null} [originalError=null] - The original error object.
   */
  constructor(message, originalError = null) {
    const detailedMessage = originalError?.message
      ? `${message} -> ${originalError.message}`
      : message;
    super(detailedMessage);
    this.name = this.constructor.name;
    this.originalError = originalError;
    logger.error(`[AIError] ${detailedMessage}`);
  }
}

/** Error for timed-out operations. */
export class TimeoutError extends AIError {}
/** Error related to generating embeddings. */
export class EmbeddingError extends AIError {}
/** Error during a chat session. */
export class ChatError extends AIError {}
/** Error related to the vector store. */
export class StoreError extends AIError {}

/**
 * A collection of custom AI error classes.
 */
export const AIErrors = {
  AIError,
  TimeoutError,
  EmbeddingError,
  ChatError,
  StoreError,
};
