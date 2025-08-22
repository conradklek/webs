import { reactive, computed } from "./reactivity";

export function useAction(actionName) {
  const state = reactive({
    data: null,
    chunk: null,
    error: null,
    isLoading: false,
    isStreaming: false,
    currentResponse: computed(() => state.data || ""),
  });

  const getActionPath = () => {
    const componentName = window.__WEBS_STATE__?.componentName;
    if (!componentName) {
      console.error(
        "useAction: Could not determine the component name for the action.",
      );
      return null;
    }
    return `/__actions__/${componentName}/${actionName}`;
  };

  const call = async (...args) => {
    const lastArg = args[args.length - 1];
    const hasOptions =
      typeof lastArg === "object" && lastArg !== null && "onFinish" in lastArg;
    const options = hasOptions ? args.pop() : {};
    const bodyArgs = args;

    state.isLoading = true;
    state.error = null;
    state.data = null;
    state.chunk = null;

    try {
      const response = await fetch(getActionPath(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyArgs),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
        state.isStreaming = true;
        state.data = "";
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkText = decoder.decode(value);
          state.chunk = chunkText;
          state.data += chunkText;
        }
        state.isStreaming = false;
        if (options.onFinish && typeof options.onFinish === "function") {
          options.onFinish(state.data.trim());
        }
      } else {
        state.data = await response.json();
      }
    } catch (e) {
      state.error = e.message;
    } finally {
      state.isLoading = false;
      state.isStreaming = false;
    }
    return state.data;
  };

  return {
    call,
    stream: call,
    state,
  };
}

export * from "./reactivity";
export * from "./renderer";
export * from "./database";
export * from "./runtime";
