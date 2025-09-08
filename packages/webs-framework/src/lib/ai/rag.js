const SYSTEM_PROMPT = `You are a helpful AI assistant. Answer the user's question based on the context provided. If the context does not contain the answer, state that you don't know.`;

function formatContext(context) {
  return context.map((item) => `- ${item.text}`).join('\n');
}

export function createRagPrompt(messages, context) {
  const lastUserMessage = messages[messages.length - 1];
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
