let socket = null;
let messageListeners = new Set();

function connect() {
  if (typeof window === "undefined") {
    return;
  }

  if (socket && socket.readyState < 2) {
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socketURL = `${protocol}//${window.location.host}${window.location.pathname}`;

  console.log(`[WebSocket] Attempting to connect to ${socketURL}...`);
  socket = new WebSocket(socketURL);

  socket.onopen = () => {
    console.log("[WebSocket] Connection established.");
  };

  socket.onmessage = (event) => {
    messageListeners.forEach((listener) => listener(event.data));
  };

  socket.onclose = () => {
    console.log("[WebSocket] Connection closed.");
    socket = null;
  };

  socket.onerror = (error) => {
    console.error("[WebSocket] Error:", error);
  };
}

export function useSocket() {
  return {
    connect,
    send(message) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      } else {
        console.warn("[WebSocket] Cannot send message, socket is not open.", {
          readyState: socket?.readyState,
        });
      }
    },
    onMessage(callback) {
      messageListeners.add(callback);
      return () => messageListeners.delete(callback);
    },
  };
}
