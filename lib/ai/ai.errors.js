/**
 * @file Defines custom error classes for AI-related operations.
 */

/**
 * A custom error class for AI-related operations.
 * @class AIError
 * @extends {Error}
 * @property {Error | null} originalError - The original error that was caught, if any.
 */
class AIError extends Error {
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
  }
}
/** Error for timed-out operations. */
class TimeoutError extends AIError {}
/** Error related to generating embeddings. */
class EmbeddingError extends AIError {}
/** Error during a chat session. */
class ChatError extends AIError {}
/** Error related to the vector store. */
class StoreError extends AIError {}

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
