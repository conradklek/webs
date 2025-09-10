class AIError extends Error {
  constructor(message, originalError = null) {
    const detailedMessage = originalError?.message
      ? `${message} -> ${originalError.message}`
      : message;
    super(detailedMessage);

    this.name = this.constructor.name;
    this.originalError = originalError;
  }
}

class TimeoutError extends AIError {}
class EmbeddingError extends AIError {}
class ChatError extends AIError {}
class StoreError extends AIError {}

export const AIErrors = {
  AIError,
  TimeoutError,
  EmbeddingError,
  ChatError,
  StoreError,
};
