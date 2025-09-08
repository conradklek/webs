import readline from 'readline/promises';
import { createAI } from './index.js';

async function runChat(ai) {
  console.log('\n--- Interactive Chat (type exit to quit) ---');
  const history = [];
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    const userInput = await rl.question('You: ');
    if (userInput.toLowerCase() === 'exit') break;

    history.push({ role: 'user', content: userInput });

    try {
      const stream = await ai.chat(history);
      let response = '';
      process.stdout.write('AI: ');
      for await (const chunk of stream) {
        process.stdout.write(chunk);
        response += chunk;
      }
      process.stdout.write('\n');
      history.push({ role: 'assistant', content: response });
    } catch (e) {
      console.error(`\n[ERROR] ${e.message}`);
      if (e.originalError) {
        console.error('--> Original Error:', e.originalError);
      }
    }
  }
  rl.close();
}

async function main() {
  let ai;
  try {
    ai = await createAI();

    await ai.seed();

    console.log('\n--- Performing Search ---');
    const results = await ai.search('What is a black hole?');
    console.log('Search Results:', results);

    await runChat(ai);
  } catch (error) {
    console.error(`[FATAL] ${error.name}: ${error.message}`);
    if (error.originalError) {
      console.error('--> Original Error:', error.originalError);
    }
  } finally {
    if (ai) {
      await ai.shutdown();
    }
  }
}

main();
