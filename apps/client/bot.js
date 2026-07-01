import { io } from "socket.io-client";

const roomCode = process.argv[2] || "9986";
const defaultName = "AI陪玩小助手_" + Math.floor(Math.random() * 1000);
const nickname = process.argv[3] || defaultName;
const serverUrl = "http://localhost:3001";

console.log(`Connecting to server: ${serverUrl} and joining room: ${roomCode} as ${nickname}...`);

const socket = io(serverUrl, {
  transports: ["websocket"]
});

let selfId = null;

const joinRoomWithRetry = () => {
  socket.emit("room:join", roomCode, nickname, (ack) => {
    if (ack.ok) {
      selfId = ack.data.playerId;
      console.log(`Joined room successfully! Player ID: ${selfId}`);
      // Toggle ready immediately
      socket.emit("player:ready", (readyAck) => {
        console.log("Ready toggled:", readyAck);
      });
    } else {
      console.error(`Failed to join room: ${ack.error}. Retrying in 5 seconds...`);
      setTimeout(joinRoomWithRetry, 5000);
    }
  });
};

socket.on("connect", () => {
  console.log("Connected to server!");
  joinRoomWithRetry();
});

function simulateDrawing(socket) {
  const colors = ["#ff6b86", "#3fe6a1", "#5be2ff", "#ffc75b", "#987cff"];
  const strokes = [];
  const totalStrokes = 3 + Math.floor(Math.random() * 3); // 3 to 5 strokes
  
  // Pre-generate the strokes
  for (let s = 0; s < totalStrokes; s++) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = 5 + Math.floor(Math.random() * 10);
    const points = [];
    const numPoints = 15 + Math.floor(Math.random() * 20);
    let startX = 200 + Math.random() * 400;
    let startY = 150 + Math.random() * 300;
    for (let p = 0; p < numPoints; p++) {
      startX += (Math.random() - 0.5) * 15;
      startY += (Math.random() - 0.5) * 15;
      points.push({
        x: Math.round(Math.max(10, Math.min(790, startX))),
        y: Math.round(Math.max(10, Math.min(590, startY)))
      });
    }
    strokes.push({
      mode: "draw",
      color,
      size,
      points
    });
  }

  // We will send sync updates at 2s, 4s, 6s, 8s
  let currentStroke = 0;
  const interval = setInterval(() => {
    currentStroke++;
    if (currentStroke <= totalStrokes) {
      const currentStrokesJson = JSON.stringify({
        width: 800,
        height: 600,
        ratio: 1,
        strokes: strokes.slice(0, currentStroke)
      });
      console.log(`AI sync drawing stroke ${currentStroke}/${totalStrokes}`);
      socket.emit("draw:strokes:sync", { strokes: currentStrokesJson });
    } else {
      clearInterval(interval);
    }
  }, 2000);

  // Return the final strokes JSON for submission
  return JSON.stringify({
    width: 800,
    height: 600,
    ratio: 1,
    strokes
  });
}

let lastActionRound = -999;
let lastActionPhase = "";
let submissionPending = false;

socket.on("room:view", (view) => {
  if (!view) return;
  
  if (view.phase !== lastActionPhase || view.roundIndex !== lastActionRound) {
    submissionPending = false;
    lastActionPhase = view.phase;
    lastActionRound = view.roundIndex;
  }
  
  console.log(`\n--- Game Phase: ${view.phase} (Round: ${view.roundIndex}) ---`);
  
  const self = view.players.find(p => p.id === selfId);
  if (!self) {
    console.error("Self player not found in room view players.");
    return;
  }
  
  if (view.phase === "LOBBY") {
    // If not ready, ready up
    if (!self.submitted) {
      console.log("Not ready. Readying up...");
      socket.emit("player:ready", (ack) => {
        console.log("Ready request acknowledged:", ack);
      });
    } else {
      console.log("Ready, waiting for host to start.");
    }
  } else if (view.phase === "TOPIC") {
    if (!self.submitted && view.task && view.task.kind === "TOPIC") {
      if (!submissionPending) {
        submissionPending = true;
        const anime = view.task.offer.anime[0];
        console.log(`Scheduled topic selection: ${anime.name} in 10s...`);
        setTimeout(() => {
          console.log(`Selecting topic now: ${anime.name}`);
          socket.emit("topic:submit", anime.id, (ack) => {
            console.log("Topic submitted:", ack);
          });
        }, 10000);
      } else {
        console.log("Topic selection is pending...");
      }
    } else {
      console.log("Waiting for others to select topic...");
    }
  } else if (view.phase === "DRAW") {
    if (!self.submitted && view.task && view.task.kind === "DRAW") {
      if (!submissionPending) {
        submissionPending = true;
        console.log(`Simulating drawing for topic: ${view.task.source.name}...`);
        
        // Start live sync simulation
        const finalStrokesJson = simulateDrawing(socket);
        const dummyDrawing = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        
        setTimeout(() => {
          console.log(`Submitting drawing now: ${view.task.source.name}`);
          socket.emit("draw:submit", { drawing: dummyDrawing, strokes: finalStrokesJson }, (ack) => {
            console.log("Drawing submitted:", ack);
          });
        }, 10000);
      } else {
        console.log("Drawing submission is pending...");
      }
    } else {
      console.log("Waiting for others to finish drawing...");
    }
  } else if (view.phase === "GUESS") {
    if (!self.submitted && view.task && view.task.kind === "GUESS") {
      if (!submissionPending) {
        submissionPending = true;
        const candidate = view.candidates[Math.floor(Math.random() * view.candidates.length)];
        console.log(`Scheduled guess: ${candidate.name} in 10s...`);
        setTimeout(() => {
          console.log(`Submitting guess now: ${candidate.name}`);
          socket.emit("guess:submit", candidate.id, (ack) => {
            console.log("Guess submitted:", ack);
          });
        }, 10000);
      } else {
        console.log("Guess submission is pending...");
      }
    } else {
      console.log("Waiting for others to finish guessing...");
    }
  } else if (view.phase === "VOTE") {
    // Vote "success" for any chain we haven't voted on yet
    view.chains.forEach(chain => {
      if (!chain.votes[selfId]) {
        console.log(`Voting success for chain of: ${chain.creatorPlayerId}`);
        socket.emit("vote:submit", chain.id, "success", (ack) => {
          console.log(`Voted success on chain ${chain.id}:`, ack);
        });
      }
    });
  } else if (view.phase === "RESULTS") {
    console.log("Game completed! Showing results.");
  }
});

socket.on("room:kicked", () => {
  console.log("Kicked by host. Exiting...");
  process.exit(0);
});

socket.on("room:error", (msg) => {
  console.error("Room error received:", msg);
});

socket.on("disconnect", () => {
  console.log("Disconnected from server.");
});
