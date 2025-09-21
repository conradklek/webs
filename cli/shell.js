#!/usr/bin/env bun

import * as readline from 'node:readline';
import { $ } from 'bun';
import {
  runAnalysis,
  createLockfile,
  generateInspectionReport,
} from './profiler.js';
import { relative, resolve as resolvePath } from 'node:path';
import {
  suspendConsoleOutput,
  resumeConsoleOutput,
  getLogBuffer,
} from '../lib/shared/logger.js';
import { createFileSystemForUser } from '../lib/server/fs.server.js';
import { generateUUID } from '../lib/shared/utils.js';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

/**
 * @param {keyof typeof colors} color
 * @param {string | number} text
 * @returns {string}
 */
const c = (color, text) => `${colors[color]}${text}${colors.reset}`;
/** @param {string} str */
const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*m/g, '');

const log = {
  /** @param {string} message */
  error: (message) => ` ${c('bold', c('red', '✖'))} ${c('red', message)} `,
};

/**
 * @typedef {object} ChatMessage
 * @property {'user' | 'assistant'} role
 * @property {string} content
 */

/**
 * @typedef {object} Chat
 * @property {string} id
 * @property {string} name
 * @property {string} topic
 * @property {string} created_at
 */

/**
 * @typedef {object} MainViewState
 * @property {string[]} outputLines
 * @property {string} inputLine
 * @property {number} cursorPos
 * @property {string[]} history
 * @property {number} historyIndex
 * @property {boolean} isBusy
 */

/**
 * @typedef {object} AiChatViewState
 * @property {string | null} chatId
 * @property {ChatMessage[]} messages
 * @property {boolean} isBusy
 */

/**
 * @typedef {object} AgentChatViewState
 * @property {ChatMessage[]} messages
 * @property {boolean} isBusy
 * @property {string | null} agentName
 * @property {any[]} toolEvents
 */

/**
 * @typedef {object} ChatSelectViewState
 * @property {Chat[]} chats
 * @property {boolean} isBusy
 * @property {string | null} error
 */

/**
 * @typedef {object} ShellState
 * @property {'main' | 'aiChat' | 'agentChat' | 'chatSelect'} currentView
 * @property {MainViewState} main
 * @property {AiChatViewState} aiChat
 * @property {AgentChatViewState} agentChat
 * @property {ChatSelectViewState} chatSelect
 */

/**
 * Starts the interactive developer shell with a stateful, view-based UI.
 * @param {import('../lib/server/server-config.js').Config} config
 * @param {import('bun').Server} server
 * @param {import('../lib/server/ai.server.js').AI} ai
 * @param {import('../lib/server/router.js').ServerContext} serverContext
 * @returns {Promise<void>}
 */
export function startDevShell(config, server, ai, serverContext) {
  return new Promise((resolve) => {
    /** @type {ShellState} */
    let state = {
      currentView: 'main',
      main: {
        outputLines: [
          c('bold', `\nWelcome to the Webs Interactive Developer Shell.`),
          c('dim', `Watching for file changes. Type 'help' for commands.\n`),
        ],
        inputLine: '',
        cursorPos: 0,
        history: [],
        historyIndex: -1,
        isBusy: false,
      },
      aiChat: {
        chatId: null,
        messages: [],
        isBusy: false,
      },
      agentChat: {
        messages: [],
        isBusy: false,
        agentName: null,
        toolEvents: [],
      },
      chatSelect: {
        chats: [],
        isBusy: false,
        error: null,
      },
    };

    const promptText = `(webs-dev) ⬢ ${config.CWD.split('/').pop()} > `;
    const prompt = c('cyan', promptText);
    const promptLength = stripAnsi(prompt).length;

    const cleanupAndExit = async () => {
      process.stdout.off('resize', redraw);
      process.stdin.off('keypress', onKeyPress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdout.write('\x1b[?25h');
      resumeConsoleOutput();
      console.log('');
      resolve();
    };

    /**
     * @param {ShellState['currentView']} view
     * @param {...any} args
     */
    const changeView = (view, ...args) => {
      state.currentView = view;
      if (view === 'aiChat') {
        const [chatId, ...promptParts] = args;
        enterAiChatView(chatId, promptParts.join(' '));
      } else if (view === 'agentChat') {
        enterAgentChatView(args[0], args.slice(1).join(' '));
      } else if (view === 'chatSelect') {
        enterChatSelectView();
      }
      redraw();
    };

    const redraw = () => {
      const { rows, columns } = process.stdout;
      process.stdout.write('\x1b[?25l');
      process.stdout.write('\x1b[2J\x1b[H');

      let headerText = '';
      switch (state.currentView) {
        case 'main':
          headerText = `[Main View] - Type 'help' for commands`;
          break;
        case 'aiChat': {
          const chatName = state.aiChat.chatId
            ? state.chatSelect.chats.find((c) => c.id === state.aiChat.chatId)
                ?.name || 'Chat'
            : 'New Chat';
          headerText = `[AI Chat: ${chatName}] - Use 'q' or '/back' on a new line to exit.`;
          break;
        }
        case 'agentChat':
          const agentName = state.agentChat.agentName || 'agent';
          headerText = `[Agent: ${agentName}] - Use 'q' or '/back' on a new line to exit.`;
          break;
        case 'chatSelect':
          headerText = `[AI Chat] - Select a chat or type 'new' to start.`;
          break;
      }

      const paddedHeader = c('bold', headerText.padEnd(columns));
      process.stdout.write(`\x1b[44m\x1b[37m${paddedHeader}\x1b[0m`);

      switch (state.currentView) {
        case 'main':
          drawMainView(rows, columns);
          break;
        case 'aiChat':
          drawAiChatView(rows, columns);
          break;
        case 'agentChat':
          drawAgentChatView(rows, columns);
          break;
        case 'chatSelect':
          drawChatSelectView(rows, columns);
          break;
      }

      process.stdout.write(`\x1b[?25h`);
    };
    /**
     * @param {number} rows
     * @param {number} _columns
     */
    const drawMainView = (rows, _columns) => {
      const outputHeight = rows - 3;
      const visibleOutput = state.main.outputLines.slice(-outputHeight);
      process.stdout.write('\n');
      process.stdout.write(visibleOutput.join('\n'));
      for (let i = visibleOutput.length; i < outputHeight; i++) {
        process.stdout.write('\n');
      }

      const fullPrompt = prompt + state.main.inputLine;
      process.stdout.write(`\x1b[${rows};1H${fullPrompt}`);
      process.stdout.write('\x1b[K');
      process.stdout.write(
        `\x1b[${rows};${promptLength + state.main.cursorPos + 1}H`,
      );
    };
    /**
     * @param {number} rows
     * @param {number} _columns
     */

    const drawChatSelectView = (rows, _columns) => {
      const outputHeight = rows - 3;
      const { chats, isBusy, error } = state.chatSelect;
      let output = [];

      if (isBusy) {
        output.push(c('dim', 'Loading chats...'));
      } else if (error) {
        output.push(c('red', `Error: ${error}`));
        output.push(c('dim', "Type 'q' or '/back' to return."));
      } else if (chats.length === 0) {
        output.push('No previous chats found.');
        output.push('\n' + c('bold', "Type 'new' to start a new chat."));
        output.push(c('dim', "Type 'q' or '/back' to return."));
      } else {
        output.push(c('bold', 'Your recent chats:'));
        chats.forEach((chat, i) => {
          const topic = chat.topic ? `- ${chat.topic.substring(0, 50)}...` : '';
          output.push(
            c('bold', `${i + 1}. ${chat.name}`) + c('dim', ` ${topic}`),
          );
        });
        output.push(
          '\n' +
            c(
              'bold',
              "Enter a number to continue a chat, or type 'new' to start a new one.",
            ),
        );
        output.push(c('dim', "Type 'q' or '/back' to return."));
      }

      if (error) {
        state.chatSelect.error = null;
      }

      const visibleOutput = output.slice(-outputHeight);
      process.stdout.write('\n');
      process.stdout.write(visibleOutput.join('\n'));
      for (let i = visibleOutput.length; i < outputHeight; i++) {
        process.stdout.write('\n');
      }

      const fullPrompt = '> ' + state.main.inputLine;
      process.stdout.write(`\x1b[${rows};1H${fullPrompt}`);
      process.stdout.write('\x1b[K');
      process.stdout.write(`\x1b[${rows};${2 + state.main.cursorPos + 1}H`);
    };

    /**
     * @param {number} rows
     * @param {number} _columns
     */
    const drawAiChatView = (rows, _columns) => {
      const outputHeight = rows - 3;
      const messagesToDisplay = [];
      for (const msg of state.aiChat.messages) {
        const prefix =
          msg.role === 'user'
            ? c('green', c('bold', 'You: '))
            : c('magenta', c('bold', 'AI:  '));
        messagesToDisplay.push(...(prefix + msg.content).split('\n'));
      }
      if (state.aiChat.isBusy) {
        messagesToDisplay.push(c('dim', 'AI is thinking...'));
      }

      const visibleOutput = messagesToDisplay.slice(-outputHeight);
      process.stdout.write('\n');
      process.stdout.write(visibleOutput.join('\n'));
      for (let i = visibleOutput.length; i < outputHeight; i++) {
        process.stdout.write('\n');
      }

      const fullPrompt = '> ' + state.main.inputLine;
      process.stdout.write(`\x1b[${rows};1H${fullPrompt}`);
      process.stdout.write('\x1b[K');
      process.stdout.write(`\x1b[${rows};${2 + state.main.cursorPos + 1}H`);
    };

    /**
     * @param {number} rows
     * @param {number} _columns
     */
    const drawAgentChatView = (rows, _columns) => {
      const outputHeight = rows - 3;
      const messagesToDisplay = [];
      for (const msg of state.agentChat.messages) {
        const prefix =
          msg.role === 'user'
            ? c('green', c('bold', 'You: '))
            : c('magenta', c('bold', 'Agent: '));
        messagesToDisplay.push(...(prefix + msg.content).split('\n'));
      }

      if (state.agentChat.toolEvents.length > 0) {
        messagesToDisplay.push(c('bold', c('yellow', '\n--- Tool Calls ---')));
        for (const tool of state.agentChat.toolEvents) {
          messagesToDisplay.push(
            c('yellow', `> Calling ${tool.name}(${JSON.stringify(tool.args)})`),
          );
          if (tool.status === 'complete') {
            messagesToDisplay.push(
              c('dim', `  └─ Result: ${JSON.stringify(tool.result)}`),
            );
          }
        }
        messagesToDisplay.push('');
      }

      if (state.agentChat.isBusy) {
        messagesToDisplay.push(c('dim', 'Agent is thinking...'));
      }

      const visibleOutput = messagesToDisplay.slice(-outputHeight);
      process.stdout.write('\n');
      process.stdout.write(visibleOutput.join('\n'));
      for (let i = visibleOutput.length; i < outputHeight; i++) {
        process.stdout.write('\n');
      }

      const fullPrompt = '> ' + state.main.inputLine;
      process.stdout.write(`\x1b[${rows};1H${fullPrompt}`);
      process.stdout.write('\x1b[K');
      process.stdout.write(`\x1b[${rows};${2 + state.main.cursorPos + 1}H`);
    };

    /** @param {string} line */
    const executeMainCommand = async (line) => {
      const trimmedLine = line.trim();
      state.main.isBusy = true;
      state.main.outputLines.push(prompt + line);
      if (trimmedLine) {
        state.main.history.unshift(trimmedLine);
        if (state.main.history.length > 100) state.main.history.pop();
      }
      state.main.historyIndex = -1;
      state.main.inputLine = '';
      state.main.cursorPos = 0;
      redraw();

      const [commandName, ...args] = trimmedLine.split(/\s+/);
      const cmd = commandName ? commands[commandName.toLowerCase()] : null;

      if (cmd) {
        const originalConsoleLog = console.log;
        const capturedOutput = [];
        console.log = (...logArgs) => {
          capturedOutput.push(
            logArgs
              .map((arg) =>
                typeof arg === 'string' ? arg : JSON.stringify(arg),
              )
              .join(' '),
          );
        };
        resumeConsoleOutput();
        try {
          await cmd.action(args);
        } catch (e) {
          const error = /** @type {Error} */ (e);
          capturedOutput.push(
            c('red', `Error executing command: ${error.message}`),
          );
        } finally {
          console.log = originalConsoleLog;
          suspendConsoleOutput();
          if (capturedOutput.length > 0) {
            state.main.outputLines.push(...capturedOutput);
          }
        }
      } else if (commandName) {
        state.main.outputLines.push(
          log.error(
            `Unknown command: '${commandName}'. Type 'help' for available commands.`,
          ),
        );
      }
      state.main.isBusy = false;
      redraw();
    };
    /** @param {string} line */
    const handleAiChatSubmit = async (line) => {
      const content = line.trim();
      if (!content) return;
      if (content === '/back' || content === 'q') {
        changeView('main');
        return;
      }

      const { aiChat: ac } = state;
      const devUser = { id: 1, username: 'anon' };
      ac.isBusy = true;
      state.main.inputLine = '';
      state.main.cursorPos = 0;

      if (!ac.chatId) {
        redraw();
        try {
          const { chatId } = await ai.createChat(
            { message: { role: 'user', content } },
            {
              db: serverContext.db,
              user: devUser,
              syncActions: serverContext.syncActions,
              server,
            },
          );
          ac.chatId = chatId;
          ac.messages.push({ role: 'user', content });
        } catch (e) {
          ac.isBusy = false;
          const message = e instanceof Error ? e.message : String(e);
          ac.messages.push({
            role: 'assistant',
            content: c('red', `Failed to create chat: ${message}`),
          });
          redraw();
          return;
        }
      } else {
        const userMessageToSave = {
          id: generateUUID(),
          chat_id: ac.chatId,
          username: devUser.username,
          message: content,
          user_id: devUser.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (serverContext.syncActions.upsertChat_messages) {
          serverContext.syncActions.upsertChat_messages(
            { user: devUser },
            userMessageToSave,
          );
        }
        ac.messages.push({ role: 'user', content });
      }

      redraw();

      const historyForApi = ac.messages.map(({ role, content }) => ({
        role,
        content,
      }));

      try {
        const stream = ai.chat(historyForApi);
        ac.isBusy = false;
        let responseText = '';
        /** @type {ChatMessage} */
        const assistantMessage = { role: 'assistant', content: '' };
        ac.messages.push(assistantMessage);

        for await (const chunk of stream) {
          responseText += chunk;
          assistantMessage.content = responseText;
          redraw();
        }

        const aiMessageToSave = {
          id: generateUUID(),
          chat_id: ac.chatId,
          username: 'assistant',
          message: responseText,
          user_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (serverContext.syncActions.upsertChat_messages) {
          serverContext.syncActions.upsertChat_messages(
            { user: devUser },
            aiMessageToSave,
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        ac.messages.push({
          role: 'assistant',
          content: c('red', `AI chat failed: ${message}`),
        });
      } finally {
        ac.isBusy = false;
        redraw();
      }
    };

    /** @param {string} line */
    const handleAgentChatSubmit = async (line) => {
      const content = line.trim();
      if (!content) return;
      if (content === '/back' || content === 'q') {
        changeView('main');
        return;
      }
      const { agentChat: ac } = state;
      const agentName = ac.agentName;
      if (!agentName) return;

      ac.messages.push({ role: 'user', content });
      ac.isBusy = true;
      ac.toolEvents = [];
      state.main.inputLine = '';
      state.main.cursorPos = 0;
      redraw();

      const agentDef = serverContext.agentRoutes[agentName];
      if (!agentDef) {
        ac.isBusy = false;
        ac.messages.push({
          role: 'assistant',
          content: c('red', `Agent '${agentName}' definition not found.`),
        });
        redraw();
        return;
      }

      try {
        const toolContext = {
          db: serverContext.db,
          user: { id: 1, username: 'dev' }, // Mock user for shell
          fs: createFileSystemForUser(1),
          ai,
          syncActions: serverContext.syncActions,
          server,
        };
        const stream = ai.agent(ac.messages, agentDef, toolContext);
        ac.isBusy = false;
        let responseText = '';
        /** @type {ChatMessage} */
        const assistantMessage = { role: 'assistant', content: '' };
        ac.messages.push(assistantMessage);

        for await (const chunk of stream) {
          try {
            const event = JSON.parse(chunk);
            if (event.type === 'chunk') {
              responseText += event.content || '';
              assistantMessage.content = responseText;
            } else if (event.type === 'tool_start') {
              ac.toolEvents.push({
                name: event.name,
                args: event.args,
                status: 'pending',
              });
            } else if (event.type === 'tool_end') {
              const toolEvent = ac.toolEvents.find(
                (e) => e.name === event.name && e.status === 'pending',
              );
              if (toolEvent) {
                toolEvent.result = event.result;
                toolEvent.status = 'complete';
              }
            }
          } catch (e) {
            responseText += chunk;
            assistantMessage.content = responseText;
          }
          redraw();
        }
      } catch (e) {
        ac.isBusy = false;
        const message = e instanceof Error ? e.message : String(e);
        ac.messages.push({
          role: 'assistant',
          content: c('red', `Agent run failed: ${message}`),
        });
      }
      redraw();
    };

    /** @param {string} output */
    const printApiResponse = (output) => {
      const capturedOutput = [];
      const [headerPart, ...bodyParts] = output.split('\r\n\r\n');
      const body = bodyParts.join('\r\n\r\n');
      const headers = headerPart?.split('\r\n') || [];
      const statusLine = headers.shift();

      if (statusLine) {
        const statusMatch = statusLine.match(/HTTP\/\d\.\d (\d+) (.*)/);
        if (statusMatch) {
          const code = parseInt(statusMatch[1] || '0', 10);
          const statusText = statusMatch[2];
          const color =
            code >= 200 && code < 300
              ? 'green'
              : code >= 400
                ? 'red'
                : 'yellow';
          capturedOutput.push(
            c('bold', `Status: ${c(color, `${code} ${statusText}`)}`),
          );
        }
      }
      capturedOutput.push(c('dim', body));
      state.main.outputLines.push(...capturedOutput);
    };

    /** @type {{ [key: string]: { description: string, action: (args: string[]) => void | Promise<void> } }} */
    const commands = {
      help: {
        description: 'Displays this help message.',
        action() {
          console.log('\nAvailable Views & Commands:\n');
          const commandList = Object.entries(commands).sort(([a], [b]) =>
            a.localeCompare(b),
          );
          for (const [name, { description }] of commandList) {
            console.log(`  ${c('bold', name.padEnd(10))} ${description}`);
          }
          console.log('\n');
        },
      },
      exit: {
        description: 'Exits the developer shell and stops the server.',
        action: cleanupAndExit,
      },
      clear: {
        description: 'Clears the output of the main view.',
        action: () => {
          state.main.outputLines = [];
        },
      },
      logs: {
        description: 'Displays recent server logs from memory.',
        action: () => {
          const buffer = getLogBuffer();
          if (buffer.length === 0) {
            console.log(c('dim', 'Log buffer is empty.'));
            return;
          }
          console.log(c('bold', '\n--- Recent Server Logs ---'));
          console.log(buffer.join('\n'));
          console.log(c('bold', '--- End of Logs ---'));
        },
      },
      ai: {
        description: 'Select a previous AI chat or start a new one.',
        action: () => changeView('chatSelect'),
      },
      chat: {
        description: "Alias for 'ai'. Starts or resumes an AI chat session.",
        action: () => changeView('chatSelect'),
      },
      agent: {
        description:
          'Runs a defined AI agent. Usage: agent [name] [initial prompt]',
        action: async (args) => {
          const [agentName, ...promptParts] = args;
          const agentDefs = serverContext.agentRoutes || {};

          if (!agentName) {
            console.log(c('bold', '\nAvailable Agents:'));
            if (Object.keys(agentDefs).length === 0) {
              console.log(
                c(
                  'dim',
                  '  No agents defined. Create files ending in .agent.webs in src/app.',
                ),
              );
            } else {
              for (const name in agentDefs) {
                console.log(`  - ${name}`);
              }
            }
            console.log('');
            return;
          }

          if (!agentDefs[agentName]) {
            console.log(log.error(`Agent '${agentName}' not found.`));
            return;
          }

          const initialPrompt = promptParts.join(' ');
          changeView('agentChat', agentName, initialPrompt);
        },
      },
      inspect: {
        description: 'Displays a report of all pages, components, and routes.',
        action: async () =>
          generateInspectionReport({ ...serverContext, config }),
      },
      analyze: {
        description: 'Runs type analysis and tests for the current target.',
        action: async () => await runAnalysis(config.CWD),
      },
      lock: {
        description:
          'Generates a webs.lock.txt file. Usage: lock [lib|src] [--include <files...>] [--exclude <patterns...>]',
        action: async (args) => {
          let lockTargetDir = config.CWD;
          let commandArgs = [...args];
          const target = commandArgs[0];
          if (target === 'lib' || target === 'src') {
            commandArgs.shift();
            lockTargetDir = resolvePath(process.cwd(), target);
            if (!(await Bun.file(lockTargetDir).exists())) {
              console.log(log.error(`Directory './${target}' not found.`));
              return;
            }
          }
          /**
           * @param {string[]} localArgs
           * @param {string} flag
           * @returns {string[]}
           */
          const getFlagValues = (localArgs, flag) => {
            const flagIndex = localArgs.indexOf(flag);
            const values = [];
            if (flagIndex !== -1) {
              for (let i = flagIndex + 1; i < localArgs.length; i++) {
                const arg = localArgs[i];
                if (arg && arg.startsWith('--')) break;
                if (arg) values.push(arg);
              }
            }
            return values;
          };
          const includedFiles = getFlagValues(commandArgs, '--include');
          const excludedPatterns = getFlagValues(commandArgs, '--exclude');
          console.log(
            `Creating lockfile for: ./${relative(
              process.cwd(),
              lockTargetDir,
            )}`,
          );
          await createLockfile(lockTargetDir, includedFiles, excludedPatterns);
        },
      },
      grep: {
        description:
          'Searches for a pattern in files. Usage: grep <pattern> [path] [--include <glob>]',
        action: async (args) => {
          const [pattern, path = config.CWD, ...rest] = args;
          if (!pattern) {
            return console.log(
              log.error('Usage: grep <pattern> [path] [--include <glob>]'),
            );
          }
          const includeIndex = rest.indexOf('--include');
          const filePattern =
            includeIndex > -1 ? rest[includeIndex + 1] : undefined;
          const grepArgs = ['-r', '-n', '-I', pattern, path];
          if (filePattern) {
            grepArgs.splice(3, 0, `--include=${filePattern}`);
          }
          const proc = Bun.spawn(['grep', ...grepArgs], {
            stdout: 'pipe',
            stderr: 'pipe',
          });
          const stdout = await new Response(proc.stdout).text();
          const stderr = await new Response(proc.stderr).text();
          /** @param {string} line */
          const highlight = (line) =>
            line.replace(
              new RegExp(pattern, 'g'),
              /** @param {string} match */
              (match) => c('red', c('bold', match)),
            );
          const outputLines = stdout
            .split('\n')
            .filter((line) => line)
            .map((line) => {
              const parts = line.split(':');
              const filePath = parts.shift();
              const lineNum = parts.shift();
              const content = parts.join(':');
              return `${c('yellow', filePath || '')}:${c(
                'cyan',
                lineNum || '',
              )}: ${highlight(content)}`;
            });
          if (outputLines.length > 0) {
            console.log(outputLines.join('\n'));
          } else {
            console.log(c('dim', 'No results found.'));
          }
          if (stderr) {
            console.log(log.error(`grep error:\n${stderr}`));
          }
        },
      },
      api: {
        description:
          'Makes an HTTP request to the dev server. Usage: api <GET|POST|..> <path> [body]',
        action: async (args) => {
          const [method, path, ...bodyParts] = args;
          if (!method || !path)
            return console.log(log.error('Usage: api <METHOD> <path> [body]'));
          const body = bodyParts.join(' ');
          const headers =
            method.toUpperCase() !== 'GET'
              ? `-H "Content-Type: application/json"`
              : '';
          const data = body ? `-d '${$.escape(body)}'` : '';
          const command = `curl -s -i -X ${method.toUpperCase()} http://localhost:${
            server.port
          }${path} ${headers} ${data}`;
          const { stdout, stderr } = await $`${{ raw: command }}`.nothrow();
          if (stderr.length > 0) {
            console.log(log.error(`Request failed.`));
            console.log(stderr.toString());
          } else {
            printApiResponse(stdout.toString());
          }
        },
      },
    };

    const enterChatSelectView = async () => {
      const { chatSelect: cs } = state;
      cs.isBusy = true;
      cs.error = null;
      redraw();
      try {
        const devUser = { id: 1, username: 'anon' };
        const chats = await ai.getChats({
          db: serverContext.db,
          user: devUser,
          syncActions: serverContext.syncActions,
          server,
        });
        cs.chats = chats;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        cs.error = message;
      } finally {
        cs.isBusy = false;
      }
      redraw();
    };

    /**
     * @param {string | null} chatId
     * @param {string} initialPrompt
     */
    const enterAiChatView = async (chatId, initialPrompt) => {
      const { aiChat: ac } = state;
      ac.chatId = chatId;
      ac.messages = [];
      state.main.inputLine = '';
      state.main.cursorPos = 0;

      if (chatId) {
        ac.isBusy = true;
        redraw();
        try {
          const messages = serverContext.db
            .prepare(
              'SELECT username, message as content FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC',
            )
            .all(chatId);

          ac.messages = messages.map(
            (/** @type {{ username: string; content: any; }} */ m) => ({
              role: m.username === 'anon' ? 'user' : 'assistant',
              content: m.content,
            }),
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          ac.messages.push({
            role: 'assistant',
            content: c('red', `Error loading chat history: ${message}`),
          });
        } finally {
          ac.isBusy = false;
        }
      }

      if (initialPrompt) {
        await handleAiChatSubmit(initialPrompt);
      } else {
        redraw();
      }
    };

    /**
     * @param {string | undefined} agentName
     * @param {string} initialPrompt
     */
    const enterAgentChatView = (agentName, initialPrompt) => {
      state.agentChat.agentName = agentName || null;
      state.agentChat.messages = [];
      state.agentChat.toolEvents = [];
      state.main.inputLine = '';
      state.main.cursorPos = 0;
      if (initialPrompt) {
        handleAgentChatSubmit(initialPrompt);
      }
    };

    /**
     * @param {string | undefined} str
     * @param {{ name: string, ctrl?: boolean, meta?: boolean }} key
     */
    const handleMainKeyPress = (str, key) => {
      const { main: m } = state;
      switch (key.name) {
        case 'return':
          executeMainCommand(m.inputLine);
          return;
        case 'backspace':
          if (m.cursorPos > 0) {
            m.inputLine =
              m.inputLine.slice(0, m.cursorPos - 1) +
              m.inputLine.slice(m.cursorPos);
            m.cursorPos--;
          }
          break;
        case 'delete':
          m.inputLine =
            m.inputLine.slice(0, m.cursorPos) +
            m.inputLine.slice(m.cursorPos + 1);
          break;
        case 'left':
          m.cursorPos = Math.max(0, m.cursorPos - 1);
          break;
        case 'right':
          m.cursorPos = Math.min(m.inputLine.length, m.cursorPos + 1);
          break;
        case 'up':
          if (m.historyIndex < m.history.length - 1) {
            m.historyIndex++;
            m.inputLine = m.history[m.historyIndex] || '';
            m.cursorPos = m.inputLine.length;
          }
          break;
        case 'down':
          if (m.historyIndex > 0) {
            m.historyIndex--;
            m.inputLine = m.history[m.historyIndex] || '';
            m.cursorPos = m.inputLine.length;
          } else {
            m.historyIndex = -1;
            m.inputLine = '';
            m.cursorPos = 0;
          }
          break;
        default:
          if (str && !key.ctrl && !key.meta) {
            m.inputLine =
              m.inputLine.slice(0, m.cursorPos) +
              str +
              m.inputLine.slice(m.cursorPos);
            m.cursorPos++;
          }
      }
    };

    /**
     * @param {string | undefined} str
     * @param {{ name: string, ctrl?: boolean, meta?: boolean }} key
     */
    const handleChatSelectKeyPress = (str, key) => {
      const { main: m, chatSelect: cs } = state;
      if (key.name === 'return') {
        const input = m.inputLine.trim().toLowerCase();
        m.inputLine = '';
        m.cursorPos = 0;
        if (input === 'new') {
          changeView('aiChat', null);
        } else if (input === 'q' || input === '/back') {
          changeView('main');
        } else {
          const index = parseInt(input, 10) - 1;
          const chat = cs.chats[index];
          if (!isNaN(index) && chat) {
            changeView('aiChat', chat.id);
          } else {
            cs.error =
              "Invalid selection. Please enter a number from the list or 'new'.";
            redraw();
          }
        }
        return;
      }
      handleMainKeyPress(str, key);
    };

    /**
     * @param {string | undefined} str
     * @param {{ name: string, ctrl?: boolean, meta?: boolean }} key
     */
    const onKeyPress = (str, key) => {
      if (key.ctrl && key.name === 'c') {
        return cleanupAndExit();
      }
      const isBusy =
        state.main.isBusy || state.aiChat.isBusy || state.agentChat.isBusy;
      if (isBusy && key.name !== 'q') return;

      switch (state.currentView) {
        case 'main':
          handleMainKeyPress(str, key);
          break;
        case 'chatSelect':
          handleChatSelectKeyPress(str, key);
          break;
        case 'aiChat':
          if (key.name === 'return') {
            handleAiChatSubmit(state.main.inputLine);
          } else {
            handleMainKeyPress(str, key);
          }
          break;
        case 'agentChat':
          if (key.name === 'return') {
            handleAgentChatSubmit(state.main.inputLine);
          } else {
            handleMainKeyPress(str, key);
          }
          break;
      }

      redraw();
    };

    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', onKeyPress);
    process.stdout.on('resize', redraw);

    suspendConsoleOutput();
    redraw();
  });
}
