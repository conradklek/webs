/**
 * @file Implements the Retrieval-Augmented Generation (RAG) logic.
 * This module is responsible for creating a final prompt for the AI by combining
 * the user's query with relevant context retrieved from the vector store.
 */

/**
 * @typedef {import('./ai.client.js').ChatMessage} ChatMessage
 * @typedef {import('./vector-store.js').SearchResult} SearchResult
 */

const SYSTEM_PROMPT = `You are a helpful AI assistant. Answer the user's question based on the context provided. If the context does not contain the answer, state that you don't know.`;

/**
 * Formats the retrieved context into a string for the prompt.
 * @internal
 * @param {SearchResult[]} context - The search results from the vector store.
 * @returns {string} The formatted context string.
 */
function formatContext(context) {
  return context.map((item) => `- ${item.text}`).join('\n');
}

/**
 * Creates a complete prompt for the AI by combining the system prompt, chat history,
 * retrieved context, and the user's latest question.
 * @param {ChatMessage[]} messages - The current chat history.
 * @param {SearchResult[]} context - The context retrieved from the vector store.
 * @returns {ChatMessage[]} The final array of messages to be sent to the AI.
 */
export function createRagPrompt(messages, context) {
  const lastUserMessage = messages[messages.length - 1];
  if (!lastUserMessage) {
    return [{ role: 'system', content: SYSTEM_PROMPT }];
  }
  const history = messages.slice(0, -1);

  const contextText =
    context?.length > 0 ? `---\nContext:\n${formatContext(context)}\n---` : '';

  const userPrompt = `${contextText}\n\nQuestion: ${lastUserMessage.content}`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userPrompt },
  ];
}
