import { useMemo, useRef, useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, getDoc } from "firebase/firestore";

import HIT from './assets/HIT.mp3';
import MISS from './assets/MISS.mp3';
import WIN from './assets/WIN.mp3';
import CHAT from './assets/CHAT.mp3';

// --- Firebase Configuration & Initialization ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Game Constants & Helpers ---
const COLS = ["A", "B", "C", "D"];
const ROWS = [1, 2, 3, 4];
const ALL_CELLS = COLS.flatMap((c) => ROWS.map((r) => `${c}${r}`));

const idx = (cell) => ALL_CELLS.indexOf(cell);
const safeRandChoice = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
};

// --- AI Logic ---
function useRefinedAI() {
  const tried = useRef(new Set());
  const queue = useRef([]);

  function reset() {
    tried.current = new Set();
    queue.current = [];
  }

  function nextMove() {
    while (queue.current.length) {
      const c = queue.current.shift();
      if (!tried.current.has(c) && ALL_CELLS.includes(c)) return c;
    }
    const candidates = ALL_CELLS.filter((c) => !tried.current.has(c));
    if (candidates.length === 0) return null;
    const parity = candidates.filter((c) => idx(c) % 2 === 0);
    return safeRandChoice(parity.length ? parity : candidates);
  }

  function registerResult(cell, hit) {
    if (!cell) return;
    tried.current.add(cell);
    if (hit) {
      const col = cell[0];
      const row = Number(cell[1]);
      const neighbours = [
        `${String.fromCharCode(col.charCodeAt(0) - 1)}${row}`,
        `${String.fromCharCode(col.charCodeAt(0) + 1)}${row}`,
        `${col}${row - 1}`,
        `${col}${row + 1}`,
      ].filter((c) => ALL_CELLS.includes(c) && !tried.current.has(c));
      neighbours.sort(() => Math.random() - 0.5).forEach((n) => queue.current.push(n));
    }
  }

  return { reset, nextMove, registerResult };
}

// --- Visual Components ---
function Confetti() {
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 1,
    color: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7'][Math.floor(Math.random() * 5)]
  }));

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1000 }}>
      {pieces.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: '-10px',
            width: '10px',
            height: '10px',
            backgroundColor: p.color,
            animation: `fall ${p.duration}s linear ${p.delay}s forwards`,
            opacity: 0
          }}
        />
      ))}
      <style>{`
        @keyframes fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function InteractiveTutorial({ onClose, sounds }) {
  const [step, setStep] = useState(0);
  const [tutorialBottles, setTutorialBottles] = useState([]); // Stores user's setup
  const [tutorialGuesses, setTutorialGuesses] = useState([]); // Stores user's shots

  const steps = [
    {
      id: "setup",
      title: "Step 1: Hide Your Fleet",
      text: "Tap 4 squares to place your bottles.\nThese specific spots will be used next!",
      task: "Place 4 bottles below",
      mode: "setup"
    },
    {
      id: "gameplay",
      title: "Step 2: Attack Practice",
      text: "Now, pretend you are the opponent.\nTry to find the bottles you just hid!",
      task: "Find all 4 bottles!",
      mode: "play"
    },
    {
      id: "feedback",
      title: "Step 3: Hit or Miss",
      text: "💥 RED = HIT (You go again!)\n⭕ GRAY = MISS (Turn ends)\n\nYou are ready for the real ocean.",
      action: "Start Game"
    }
  ];

  const current = steps[step];
  const isSetup = current.mode === "setup";
  const isGameplay = current.mode === "play";

  // Handle clicks with Game Logic + Sounds
  const handleDemoClick = (cell) => {
    if (isSetup) {
      setTutorialBottles(prev => {
        if (prev.includes(cell)) return prev.filter(c => c !== cell);
        if (prev.length >= 4) return prev;
        return [...prev, cell];
      });
    } else if (isGameplay) {
      if (!tutorialGuesses.includes(cell)) {
        // Determine Hit/Miss based on Step 1 placements
        const isHit = tutorialBottles.includes(cell);

        // Play Sound 
        const audio = isHit ? sounds?.hit : sounds?.miss;
        if (audio) {
          const s = audio.cloneNode(true);
          s.volume = 0.6;
          s.play().catch(() => { });
        }

        setTutorialGuesses(prev => [...prev, cell]);
      }
    }
  };

  const canProceed = () => {
    if (current.id === "feedback") return true;
    if (isSetup) return tutorialBottles.length === 4;
    // For gameplay, proceed if they found all 4 bottles
    if (isGameplay) {
      const foundCount = tutorialGuesses.filter(c => tutorialBottles.includes(c)).length;
      return foundCount === 4;
    }
    return false;
  };

  const nextStep = () => {
    if (step < steps.length - 1) {
      setStep(s => s + 1);
      // Do NOT reset bottles here, we keep them for Step 2
    } else {
      onClose();
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        width: '100%', maxWidth: '380px', // Responsive width
        background: '#ffffff', borderRadius: '24px',
        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
        padding: '24px', position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh' // Prevent overflow on small mobiles
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '12px', right: '12px', background: '#f3f4f6', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: '#6b7280', zIndex: 10 }} aria-label="Close">✕</button>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '16px', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px 0', color: '#3730a3' }}>How to Play</h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, fontWeight: 500 }}>
            Shatter the enemy bottles before yours get smashed.
          </p>
        </div>



        {/* Content */}
        <div style={{ marginBottom: '20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#111827' }}>{current.title}</h3>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', background: '#f9fafb', padding: '4px 8px', borderRadius: '10px', border: '1px solid #f3f4f6' }}>
              {step + 1} / 3
            </span>
          </div>
          <p style={{ fontSize: '14px', color: '#4b5563', margin: 0, lineHeight: 1.4, whiteSpace: 'pre-line' }}>{current.text}</p>
        </div>

        {/* Interactive Grid Area */}
        {(isSetup || isGameplay) && (
          <div style={{
            marginBottom: '10px', background: '#f8fafc', padding: '12px',
            borderRadius: '16px', border: '1px solid #f1f5f9',
            overflowY: 'auto' // Safety scroll for tiny screens
          }}>
            <p style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: canProceed() ? '#10b981' : '#6366f1', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {canProceed() ? "✅ Excellent! Continue." : current.task}
            </p>

            {/* THE GRID: Matches main game 4x4 layout exactly */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '6px',
              width: '100%',
              aspectRatio: '1' // Keeps it square 
            }}>
              {ALL_CELLS.map((c) => {
                // Determine State
                const isPlaced = tutorialBottles.includes(c);
                const isGuessed = tutorialGuesses.includes(c);

                // Visual Logic
                let bg = '#ffffff';
                let color = '#1f2937';
                let content = c;
                let border = 'none'; // Default no border
                let animation = 'none';
                let shadow = '0 2px 4px rgba(0,0,0,0.1)';

                if (isSetup) {
                  // SETUP PHASE: Show bottles
                  if (isPlaced) {
                    bg = '#f59e0b'; content = '🧴'; border = '2px solid #e5e7eb'; animation = 'popIn 0.3s';
                  } else {
                    border = '2px solid #e5e7eb';
                  }
                } else {
                  // GAMEPLAY PHASE: Hide bottles, show guesses
                  if (isGuessed) {
                    // Check against the REAL placement from Step 1
                    if (isPlaced) {
                      bg = '#10b981'; color = '#ffffff'; content = '💥'; animation = 'popIn 0.3s';
                    } else {
                      bg = '#e5e7eb'; color = '#6b7280'; content = '⭕';
                    }
                  }
                }

                return (
                  <button key={c} onClick={() => handleDemoClick(c)} style={{
                    width: '100%', height: '100%', padding: 0, borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: (['🧴', '💥', '⭕'].includes(content)) ? 'clamp(16px, 4vw, 20px)' : 'clamp(10px, 3vw, 12px)',
                    border: border,
                    cursor: 'pointer', background: bg, color: color,
                    boxShadow: shadow,
                    fontFamily: 'inherit',
                    transition: 'transform 0.1s',
                    animation: animation,
                    transform: (isSetup && isPlaced) || (isGameplay && isGuessed) ? 'scale(0.95)' : 'scale(1)'
                  }}>
                    {content}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
          {step > 0 && (
            <button onClick={() => { setStep(s => s - 1); setTutorialGuesses([]); }} style={{ padding: '12px 16px', borderRadius: '12px', background: '#f3f4f6', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#4b5563', fontFamily: 'inherit' }}>
              Back
            </button>
          )}
          <button
            onClick={nextStep}
            disabled={!canProceed()}
            style={{
              flex: 1, padding: '14px', borderRadius: '12px', border: 'none',
              background: canProceed() ? '#4f46e5' : '#e5e7eb',
              color: canProceed() ? 'white' : '#9ca3af',
              fontWeight: 700, fontFamily: 'inherit', cursor: canProceed() ? 'pointer' : 'default',
              transition: 'all 0.2s', fontSize: '15px'
            }}>
            {current.action || "Continue"}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes popIn {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// --- Main App Component ---
export default function BottleshipApp() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState(null);
  const [screen, setScreen] = useState("menu");

  const [playerBottles, setPlayerBottles] = useState([]);
  const [opponentBottles, setOpponentBottles] = useState([]);
  const [playerGrid, setPlayerGrid] = useState(() => ALL_CELLS.map(() => null));
  const [opponentGrid, setOpponentGrid] = useState(() => ALL_CELLS.map(() => null));

  const [currentTurn, setCurrentTurn] = useState("player");
  const [activePlayer, setActivePlayer] = useState(1);
  const [message, setMessage] = useState("");
  const [winner, setWinner] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const [player1Name, setPlayer1Name] = useState("");
  const [player2Name, setPlayer2Name] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [opponentName, setOpponentName] = useState("Opponent"); // NEW

  // Online specific state
  const [roomCode, setRoomCode] = useState("");
  const [joinRoomInput, setJoinRoomInput] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [onlineGameData, setOnlineGameData] = useState(null);

  // NEW: Track if opponent left and if we are the one leaving
  const [showOpponentLeft, setShowOpponentLeft] = useState(false);
  const isLeavingRef = useRef(false);

  // --- CHAT / EMOTE STATE ---
  const [showEmoteMenu, setShowEmoteMenu] = useState(false);
  const [activeEmote, setActiveEmote] = useState(null); // { text: "...", isMine: true/false }
  const lastEmoteIdRef = useRef(0); // To track which message we already saw
  const lastSentTimeRef = useRef(0);

  const EMOTES = [
    "🚀 Play Fast!",
    "🎯 Nice Shot!",
    "😱 Ouch!",
    "🤔 Thinking...",
    "😅 Lucky!",
    "🤝 Good Game!"
  ];

  // --- PWA INSTALL LOGIC ---
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault(); // Prevent Chrome's default mini-infobar
      setDeferredPrompt(e); // Save the event so we can trigger it later
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt(); // Show the native install popup
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null); // Hide button if installed
    }
  };

  const sounds = useMemo(() => {
    const h = new Audio(HIT); h.preload = 'auto';
    const m = new Audio(MISS); m.preload = 'auto';
    const w = new Audio(WIN); w.preload = 'auto';
    const c = new Audio(CHAT); c.preload = 'auto';

    return { hit: h, miss: m, win: w, chat: c };
  }, []);

  const aiRef = useRef(null);
  const aiHelper = useRefinedAI();
  if (!aiRef.current) aiRef.current = aiHelper;

  // --- Auth & Setup ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();

    // NEW: Check for existing session
    const savedSession = sessionStorage.getItem('bottleship_session');
    if (savedSession) {
      const { code, isHost: savedIsHost, name } = JSON.parse(savedSession);
      setRoomCode(code);
      setIsHost(savedIsHost);
      setPlayerName(name);
      setMode('online');
      // The snapshot listener will kick in automatically because roomCode is set
    }

    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- AI WIN CHECK FIX ---
  // This hook ensures that if the AI hits 4 bottles, the game ends immediately.
  useEffect(() => {
    if (mode === 'ai' && !winner) {
      const hits = opponentGrid.filter(c => c === 'hit').length;
      if (hits >= 4) {
        finishGame('opponent');
      }
    }
  }, [opponentGrid, mode, winner]);

  // --- Online Game Sync ---
  useEffect(() => {
    if (mode !== 'online' || !roomCode || !user) return;

    const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'bottleship', roomCode);

    const unsub = onSnapshot(gameRef, (snapshot) => {
      if (!snapshot.exists()) {
        if (!isHost) alert("Room destroyed or invalid");
        return;
      }

      const data = snapshot.data();
      setOnlineGameData(data);

      // --- DETECT INCOMING EMOTES ---
      if (data.lastEmote && data.lastEmote.id !== lastEmoteIdRef.current) {
        lastEmoteIdRef.current = data.lastEmote.id;

        const sender = data.lastEmote.from;
        const amIHost = isHost; // Ensure this variable is accessible or use state
        // logic: if sender is 'host' and I am 'host', it's me.
        const isMe = (sender === 'host' && amIHost) || (sender === 'guest' && !amIHost);

        if (!isMe) {
          playSound(sounds.chat);
          // Play a sound if you want: sounds.pop.play()
          setActiveEmote({ text: data.lastEmote.content, isMine: false });
          setTimeout(() => setActiveEmote(null), 3000);
        }
      }

      // --- DETECT ABANDONMENT ---
      if (data.status === 'abandoned') {
        // Only show the popup if WE aren't the one who clicked Exit
        if (!isLeavingRef.current && screen !== 'menu') {
          setShowOpponentLeft(true);
        }
        return;
      }

      // --- CRITICAL FIX FOR SELF-PLAY TESTING ---
      // If both players are the same user (browser tabs), use local state 'isHost' to distinguish.
      const isSelfPlay = data.host === data.guest;
      const amIHost = isSelfPlay ? isHost : (data.host === user.uid);

      const myBottles = amIHost ? data.hostBottles : data.guestBottles;
      const oppBottles = amIHost ? data.guestBottles : data.hostBottles;
      const myMoves = amIHost ? data.hostMoves : data.guestMoves;
      const oppMoves = amIHost ? data.guestMoves : data.hostMoves;

      // Update local state derived from server state
      if (screen !== 'setup' || (myBottles && myBottles.length > 0)) {
        setPlayerBottles(myBottles || []);
      }

      setOpponentBottles(oppBottles || []);
      setPlayerName(amIHost ? data.hostName : data.guestName);

      // --- NEW NAME SYNC LOGIC ---
      if (amIHost) {
        setPlayerName(data.hostName || "Host");
        setOpponentName(data.guestName || "Guest"); // Save opponent name
      } else {
        setPlayerName(data.guestName || "Guest");
        setOpponentName(data.hostName || "Host"); // Save opponent name
      }

      // Handle Rematch/Reset Logic
      if (data.status === 'setup') {
        // If we are currently on the Game Over screen (guess) or playing, reset us
        if (screen === 'guess' || screen === 'playing') {
          setWinner(null);
          setPlayerBottles([]);
          setOpponentBottles([]);
          setPlayerGrid(ALL_CELLS.map(() => null));
          setOpponentGrid(ALL_CELLS.map(() => null));
          setScreen('setup');
          setMessage("Rematch! Place your bottles.");
        } else if (screen !== 'setup') {
          setScreen('setup');
        }
      }

      if (data.status === 'playing' && screen !== 'guess') {
        setScreen('guess');
      }

      // Auto-Start Game
      if (data.status !== 'playing' && data.hostBottles && data.guestBottles && data.hostBottles.length === 4 && data.guestBottles.length === 4) {
        if (amIHost) {
          updateDoc(gameRef, { status: 'playing' });
        }
      }

      // Construct Grids for UI
      const newPlayerGrid = ALL_CELLS.map(cell => myMoves && myMoves[cell] ? myMoves[cell] : null);
      setPlayerGrid(newPlayerGrid);

      const newOppGrid = ALL_CELLS.map(cell => oppMoves && oppMoves[cell] ? oppMoves[cell] : null);
      setOpponentGrid(newOppGrid);

      if (data.status === 'playing') {
        setCurrentTurn(data.turn === (amIHost ? 'host' : 'guest') ? 'player' : 'opponent');
        setMessage(data.turn === (amIHost ? 'host' : 'guest') ? "Your Turn" : "Opponent's Turn");
      }

      if (data.winner) {
        setWinner(data.winner === (amIHost ? 'host' : 'guest') ? 'player' : 'opponent');
        if (!winner && data.winner) {
          if (data.winner === (amIHost ? 'host' : 'guest')) {
            finishGame('player');
          } else {
            finishGame('opponent');
          }
        }
      }

    }, (error) => {
      console.error("Game sync error:", error);
    });

    return () => unsub();
  }, [mode, roomCode, user, screen, isHost]);

  async function leaveOnlineRoom() {
    // 1. Mark that WE are intentionally leaving, so we ignore any 'abandoned' updates
    isLeavingRef.current = true;

    if (mode === 'online' && roomCode) {
      try {
        const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'bottleship', roomCode);
        // 2. This update triggers onSnapshot immediately (locally)
        await updateDoc(gameRef, { status: 'abandoned' });
      } catch (e) {
        console.error("Error leaving room:", e);
      }
    }
    resetAll();
    setScreen('menu');
  }

  // Helper for low-latency overlapping audio
  const playSound = (audioObj) => {
    if (!audioObj) return;
    // cloneNode(true) creates a fresh instance allowing rapid-fire playback
    const sound = audioObj.cloneNode(true);
    sound.volume = 0.6; // Adjust volume if needed
    sound.play().catch((e) => console.log("Audio play failed:", e));
  };

  function resetAll() {
    sessionStorage.removeItem('bottleship_session'); // NEW: Clear session
    setPlayerBottles([]);
    setOpponentBottles([]);
    setPlayerGrid(ALL_CELLS.map(() => null));
    setOpponentGrid(ALL_CELLS.map(() => null));
    setCurrentTurn("player");
    setActivePlayer(1);
    setMessage("");
    setWinner(null);
    setShowConfetti(false);
    setPlayer1Name("");
    setPlayer2Name("");
    setPlayerName("");
    setOpponentName("Opponent"); // NEW
    setRoomCode("");
    setJoinRoomInput("");
    setIsHost(false);
    setOnlineGameData(null);
    // NEW: Reset the leaving flag and the popup state
    isLeavingRef.current = false;
    setShowOpponentLeft(false);
    aiRef.current.reset();
  }

  function autoPlace(setter) {
    const pool = [...ALL_CELLS];
    const chosen = [];
    while (chosen.length < 4 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      chosen.push(pool.splice(i, 1)[0]);
    }
    setter(chosen);
  }

  function startAIMode() {
    resetAll();
    setMode("ai");
    setScreen("name-input-ai");
  }

  function startPassMode() {
    resetAll();
    setMode("pass");
    setScreen("name-input-pass");
  }

  function startOnlineMode() {
    resetAll();
    setMode("online");
    setScreen("name-input-online");
  }

  async function createRoom() {
    if (!user) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code);
    setIsHost(true);

    // NEW: Save session
    sessionStorage.setItem('bottleship_session', JSON.stringify({
      code,
      isHost: true,
      name: playerName || "Player 1"
    }));

    setPlayerName("Host");

    const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'bottleship', code);
    await setDoc(gameRef, {
      host: user.uid,
      hostName: playerName || "Player 1",
      guestName: "Player 2",
      status: 'waiting',
      turn: 'host',
      hostMoves: {},
      guestMoves: {},
      created: Date.now()
    });

    setScreen("online-waiting");
  }

  async function joinRoom() {
    if (!user) return;
    const code = joinRoomInput.trim().toUpperCase();
    if (!code) {
      alert('Please enter a room code');
      return;
    }

    const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'bottleship', code);
    const snap = await getDoc(gameRef);

    if (!snap.exists()) {
      alert('Room not found');
      return;
    }

    if (snap.data().guest && snap.data().guest !== user.uid) {
      alert("Room full");
      return;
    }

    await updateDoc(gameRef, {
      guest: user.uid,
      guestName: playerName || "Guest",
      status: 'setup'
    });

    setRoomCode(code);
    setIsHost(false);

    // NEW: Save session
    sessionStorage.setItem('bottleship_session', JSON.stringify({
      code,
      isHost: false,
      name: playerName || "Guest"
    }));

    setPlayerName("Guest");
  }

  function togglePlacement(cell) {
    if (!screen.startsWith("setup")) return;
    setPlayerBottles((prev) => {
      if (prev.includes(cell)) return prev.filter((c) => c !== cell);
      if (prev.length >= 4) return prev;
      return [...prev, cell];
    });
  }

  async function finalizeSetup() {
    if (playerBottles.length !== 4) {
      alert("Place exactly 4 bottles");
      return;
    }

    if (mode === "online") {
      const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'bottleship', roomCode);
      const updateData = isHost ? { hostBottles: playerBottles } : { guestBottles: playerBottles };
      await updateDoc(gameRef, updateData);
      setMessage("Waiting for opponent...");
      return;
    }

    if (mode === "ai") {
      autoPlace(setOpponentBottles);
      setScreen("guess");
      setMessage(`${playerName}, your turn!`);
    } else if (mode === "pass") {
      setScreen("setup-pass-2");
      setMessage(`${player2Name}, place your bottles now`);
    }
  }

  const [tempSecondBottles, setTempSecondBottles] = useState([]);
  function toggleSecond(cell) {
    if (screen !== "setup-pass-2") return;
    setTempSecondBottles((prev) => {
      if (prev.includes(cell)) return prev.filter((c) => c !== cell);
      if (prev.length >= 4) return prev;
      return [...prev, cell];
    });
  }

  function finalizePassSecond() {
    if (tempSecondBottles.length !== 4) {
      alert(`Place 4 bottles`);
      return;
    }
    setOpponentBottles(tempSecondBottles);
    setTempSecondBottles([]);
    setActivePlayer(1);
    setCurrentTurn("player");
    setScreen("guess");
    setMessage(`${player1Name}'s turn`);
  }

  const sendEmote = async (text) => {
    const now = Date.now();
    const COOLDOWN_MS = 2000; // 2 seconds cooldown

    // 1. SPAM CHECK: If clicked too soon, do nothing
    if (now - lastSentTimeRef.current < COOLDOWN_MS) {
      return;
    }

    // Update the last sent time
    lastSentTimeRef.current = now;

    // 2. Close menu and Play Sound immediately
    setShowEmoteMenu(false);

    // Play sound (using the helper if you added it, or direct logic)
    if (sounds.chat) {
      const s = sounds.chat.cloneNode(true);
      s.volume = 0.6;
      s.play().catch(() => { });
    }

    // 3. Show locally immediately (instant feedback)
    setActiveEmote({ text, isMine: true });
    setTimeout(() => setActiveEmote(null), 3000);

    // 4. Send to network
    if (mode === 'online' && roomCode) {
      const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'bottleship', roomCode);
      // Fire and forget (no await needed for UI)
      updateDoc(gameRef, {
        lastEmote: {
          content: text,
          from: isHost ? 'host' : 'guest',
          id: now // Use the same timestamp
        }
      }).catch(err => console.error("Emote failed:", err));
    }
  };

  async function playerGuess(cell) {
    if (winner) return;

    // --- Online Mode Logic ---
    if (mode === 'online') {
      if (currentTurn !== 'player') return;

      // Derived check to ensure we know exactly who we are based on DB state
      const isSelfPlay = onlineGameData.host === onlineGameData.guest;
      const amIHost = isSelfPlay ? isHost : (onlineGameData.host === user.uid);

      if (playerGrid[idx(cell)]) return;

      const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'bottleship', roomCode);
      // Use amIHost here instead of isHost state
      const oppBottles = amIHost ? onlineGameData.guestBottles : onlineGameData.hostBottles;
      const hit = oppBottles.includes(cell);
      const result = hit ? 'hit' : 'miss';

      const myMoves = amIHost ? onlineGameData.hostMoves : onlineGameData.guestMoves;
      const newMoves = { ...myMoves, [cell]: result };

      let newWinner = null;
      let hitsCount = Object.values(newMoves).filter(v => v === 'hit').length;
      if (hitsCount >= 4) {
        newWinner = amIHost ? 'host' : 'guest';
      }

      const updatePayload = {
        [amIHost ? 'hostMoves' : 'guestMoves']: newMoves
      };

      if (newWinner) {
        updatePayload.winner = newWinner;
        updatePayload.status = 'finished';
      } else if (!hit) {
        updatePayload.turn = amIHost ? 'guest' : 'host';
      }

      if (hit) {
        playSound(sounds.hit)
      } else {
        playSound(sounds.miss)
      }

      await updateDoc(gameRef, updatePayload);
      return;
    }

    // --- Pass & Play Mode Logic ---
    if (mode === "pass") {
      const i = idx(cell);

      if (activePlayer === 1) {
        if (playerGrid[i]) {
          setMessage("Already guessed");
          return;
        }
        const hit = opponentBottles.includes(cell); // P1 guesses on P2's bottles

        // Optimistic Update
        const newGrid = [...playerGrid];
        newGrid[i] = hit ? "hit" : "miss";
        setPlayerGrid(newGrid);

        if (hit) {
          playSound(sounds.hit);
          setMessage(`Hit! ${player1Name} goes again`);
          const hitsCount = newGrid.filter((c) => c === "hit").length;
          if (hitsCount >= 4) {
            finishGame(1);
            return;
          }
          return;
        }

        playSound(sounds.miss);

        setActivePlayer(2);
        setMessage(`${player2Name}'s turn`);

      } else {
        // Player 2 Logic
        if (opponentGrid[i]) {
          setMessage("Already guessed");
          return;
        }
        const hit = playerBottles.includes(cell); // P2 guesses on P1's bottles

        const newGrid = [...opponentGrid];
        newGrid[i] = hit ? "hit" : "miss";
        setOpponentGrid(newGrid);

        if (hit) {
          playSound(sounds.hit);
          setMessage(`Hit! ${player2Name} goes again`);
          const hitsCount = newGrid.filter((c) => c === "hit").length;
          if (hitsCount >= 4) {
            finishGame(2);
            return;
          }
          return;
        }

        playSound(sounds.miss)
        setActivePlayer(1);
        setMessage(`${player1Name}'s turn`);
      }
      return;
    }

    // --- AI Mode Logic ---
    if (!(screen === "guess")) return;
    if (currentTurn !== "player") return;

    const i = idx(cell);
    if (playerGrid[i]) {
      setMessage("Already guessed");
      return;
    }

    const hit = opponentBottles.includes(cell);
    setPlayerGrid((g) => {
      const copy = [...g];
      copy[i] = hit ? "hit" : "miss";
      return copy;
    });

    if (hit) {
      playSound(sounds.hit);
      setMessage(`Hit! Go again`);
      const hitsCount = playerGrid.filter((c) => c === "hit").length + 1;
      if (hitsCount >= 4) {
        finishGame("player");
        return;
      }
      return;
    }

    playSound(sounds.miss);

    if (mode === "ai") {
      setCurrentTurn("opponent");
      setMessage("AI thinking...");
      setTimeout(aiPlay, 700);
    }
  }

  function aiPlay() {
    const next = aiRef.current.nextMove();
    if (!next) {
      finishGame("player");
      return;
    }
    const i = idx(next);
    if (opponentGrid[i]) {
      aiRef.current.registerResult(next, false);
      setTimeout(aiPlay, 0);
      return;
    }
    const wasHit = playerBottles.includes(next);
    setOpponentGrid((g) => {
      const copy = [...g];
      copy[i] = wasHit ? "hit" : "miss";
      return copy;
    });
    aiRef.current.registerResult(next, wasHit);
    if (wasHit) {
      playSound(sounds.hit);
      setTimeout(aiPlay, 500);
    } else {
      playSound(sounds.miss);
      setCurrentTurn("player");
      setMessage(`Your turn`);
    }
  }

  function finishGame(w) {
    setWinner(w);
    setShowConfetti(true);
    playSound(sounds.win);

    if (mode === "pass") {
      setMessage(w === 1 ? `${player1Name} Wins! 🎉` : `${player2Name} Wins! 🎉`);
    } else if (mode === "online") {
      // Use real names for the result message
      const wName = w === 'player' ? playerName : opponentName;
      setMessage(`${wName} Wins! 🎉`);
    } else {
      setMessage(w === "player" ? `${playerName} Wins! 🎉` : "AI Wins!");
    }

    setTimeout(() => setShowConfetti(false), 3000);
  }


  const baseStyle = { fontFamily: 'system-ui, -apple-system, sans-serif' };

  const handlePlayAgain = async () => {
    if (mode === 'pass') {
      setWinner(null);
      setPlayerBottles([]);
      setOpponentBottles([]);
      setPlayerGrid(ALL_CELLS.map(() => null));
      setOpponentGrid(ALL_CELLS.map(() => null));
      setActivePlayer(1);
      setCurrentTurn('player');
      setScreen('setup-pass');
    } else if (mode === 'online') {
      // Reset DB state to setup
      const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'bottleship', roomCode);
      await updateDoc(gameRef, {
        status: 'setup',
        hostBottles: [],
        guestBottles: [],
        hostMoves: {},
        guestMoves: {},
        winner: null,
        turn: 'host'
      });
    } else if (mode === 'ai') {
      setWinner(null);
      setPlayerBottles([]);
      setOpponentBottles([]);
      setPlayerGrid(ALL_CELLS.map(() => null));
      setOpponentGrid(ALL_CELLS.map(() => null));
      aiRef.current.reset();
      setScreen('setup');
    }
  };

  return (
    <div style={{ ...baseStyle, minHeight: '100vh', padding: '12px', background: 'linear-gradient(135deg,#eef2ff,#fff7ed)' }}>
      {showConfetti && <Confetti />}

      <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{
          fontSize: 'clamp(32px, 8vw, 48px)',
          fontWeight: 900,
          textAlign: 'center',
          marginBottom: '24px',
          animation: 'float 3s ease-in-out infinite'
        }}>
          {/* Emoji stays normal */}
          <span style={{ display: 'inline-block', marginRight: '10px' }}>🧴</span>

          {/* Text gets the cool gradient */}
          <span style={{
            background: 'linear-gradient(135deg, #4f46e5, #ec4899)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Bottleship
          </span>
        </h1>

        {screen === 'menu' && (
          <div style={{ background: 'rgba(255,255,255,0.95)', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', textAlign: 'center' }}>Choose Your Mode</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button onClick={startAIMode} style={{ padding: '16px', borderRadius: '12px', background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, fontFamily: 'inherit' }}>🤖 Play vs AI</button>
              <button onClick={startPassMode} style={{ padding: '16px', borderRadius: '12px', background: 'linear-gradient(90deg,#34d399,#06b6d4)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, fontFamily: 'inherit' }}>👥 Pass & Play (2P)</button>
              <button onClick={startOnlineMode} style={{ padding: '16px', borderRadius: '12px', background: 'linear-gradient(90deg,#fb923c,#ef4444)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, fontFamily: 'inherit' }}>🌐 Online (Multiplayer)</button>
            </div>

            {/* NEW: Secondary Action Row */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '12px', textAlign: 'center' }}>

              {/* NEW: Install App Button (Only visible if installable) */}
              {deferredPrompt && (
                <button
                  onClick={handleInstallClick}
                  style={{
                    padding: '14px', borderRadius: '12px',
                    background: '#1e293b', // Dark/Black stands out as "System" action
                    color: 'white', border: 'none', cursor: 'pointer',
                    fontSize: '16px', fontWeight: 700, fontFamily: 'inherit',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexDirection: 'column',
                    transition: 'transform 0.2s',
                    animation: 'pulse-subtle 2s infinite'
                  }}
                >
                  <span style={{ fontSize: '18px' }}>📲</span> Install as App
                </button>
              )}

              <style>{`
                @keyframes pulse-subtle {
                  0% { box-shadow: 0 0 0 0px rgba(30, 41, 59, 0.2); }
                  70% { box-shadow: 0 0 0 10px rgba(30, 41, 59, 0); }
                  100% { box-shadow: 0 0 0 0px rgba(30, 41, 59, 0); }
                }
              `}</style>

              <button
                onClick={() => setScreen('tutorial')}
                style={{
                  flex: 1, padding: '12px', borderRadius: '12px',
                  background: '#eff6ff', color: '#3730a3', border: '1px solid #c7d2fe',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                📺 <br /> How to Play
              </button>

              {/* NEW: Video Link Button */}
              <a
                href="https://youtube.com/watch?v=YOUR_VIDEO_ID"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '12px', fontWeight: 700, color: '#ef4444',
                  textDecoration: 'none', background: '#fef2f2',
                  padding: '6px 12px', borderRadius: '20px', border: '1px solid #fee2e2'
                }}
              >
                ▶ <br />  Watch  <br /> "How To Play" Video
              </a>
            </div>

            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f3f4f6', textAlign: 'center' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#6b7280', fontWeight: 500 }}>
                Built with ❤️ by <span style={{ fontWeight: '700', color: '#870cecff' }}>Ruchit Kukadiya</span>
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
                {/* Instagram */}
                <a href="https://www.instagram.com/ruchit.kukadiya/" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: '#6b7280', transition: 'color 0.2s', fontSize: '14px', fontWeight: 600 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                  </svg>
                  <span>Instagram</span>
                </a>

                {/* YouTube */}
                <a href="https://www.youtube.com/c/RuchitKukadiya" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: '#6b7280', transition: 'color 0.2s', fontSize: '14px', fontWeight: 600 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"></path>
                    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
                  </svg>
                  <span>YouTube</span>
                </a>

                {/* LinkedIn */}
                <a href="https://in.linkedin.com/in/ruchit-kukadiya" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: '#6b7280', transition: 'color 0.2s', fontSize: '14px', fontWeight: 600 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                    <rect x="2" y="9" width="4" height="12"></rect>
                    <circle cx="4" cy="4" r="2"></circle>
                  </svg>
                  <span>LinkedIn</span>
                </a>
              </div>
            </div>

            <button
              onClick={() => window.location.href = "mailto:ruchitkukadiya111@gmail.com?subject=Bottleship Feedback"}
              style={{
                padding: '12px', borderRadius: '12px', margin: 'auto', marginTop: '20px',
                background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3',
                cursor: 'pointer', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              💌 Feedback
            </button>
          </div>
        )}

        {/* ... (Tutorial, Name Inputs - UNCHANGED from previous version) ... */}
        {screen === 'tutorial' && (
          <InteractiveTutorial onClose={() => setScreen('menu')} />
        )}

        {screen === 'name-input-ai' && (
          <div style={{ background: 'rgba(255,255,255,0.95)', padding: '24px', borderRadius: '16px', maxWidth: '400px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', textAlign: 'center' }}>Enter Your Name</h3>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your name"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '2px solid #e5e7eb', fontSize: '16px', marginBottom: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && playerName.trim()) {
                  setScreen('setup');
                }
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  if (!playerName.trim()) {
                    alert('Please enter your name');
                    return;
                  }
                  setScreen('setup');
                }}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#4f46e5', color: 'white', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, fontFamily: 'inherit' }}
              >
                Continue
              </button>
              <button
                onClick={() => { resetAll(); setScreen('menu'); }}
                style={{ padding: '12px 20px', borderRadius: '8px', background: '#e5e7eb', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {screen === 'name-input-online' && (
          <div style={{ background: 'rgba(255,255,255,0.95)', padding: '24px', borderRadius: '16px', maxWidth: '400px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', textAlign: 'center' }}>Enter Name for Online</h3>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your name"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '2px solid #e5e7eb', fontSize: '16px', marginBottom: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { if (playerName.trim()) setScreen('online-setup'); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#4f46e5', color: 'white', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, fontFamily: 'inherit' }}>Continue</button>
              <button onClick={() => { resetAll(); setScreen('menu'); }} style={{ padding: '12px', borderRadius: '8px', background: '#e5e7eb', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>Back</button>
            </div>
          </div>
        )}

        {screen === 'name-input-pass' && (
          <div style={{ background: 'rgba(255,255,255,0.95)', padding: '24px', borderRadius: '16px', maxWidth: '400px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', textAlign: 'center' }}>Enter Player Names</h3>
            <input
              type="text"
              value={player1Name}
              onChange={(e) => setPlayer1Name(e.target.value)}
              placeholder="Player 1 name"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '2px solid #e5e7eb', fontSize: '16px', marginBottom: '12px', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <input
              type="text"
              value={player2Name}
              onChange={(e) => setPlayer2Name(e.target.value)}
              placeholder="Player 2 name"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '2px solid #e5e7eb', fontSize: '16px', marginBottom: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && player1Name.trim() && player2Name.trim()) {
                  setScreen('setup-pass');
                }
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  if (!player1Name.trim() || !player2Name.trim()) {
                    alert('Please enter both player names');
                    return;
                  }
                  setScreen('setup-pass');
                }}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#10b981', color: 'white', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, fontFamily: 'inherit' }}
              >
                Start Game
              </button>
              <button
                onClick={() => { resetAll(); setScreen('menu'); }}
                style={{ padding: '12px 20px', borderRadius: '8px', background: '#e5e7eb', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {screen === 'setup' && (
          <div style={{ background: 'rgba(255,255,255,0.95)', padding: '16px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: 'clamp(16px, 4vw, 18px)', fontWeight: 700 }}>{playerName} – Place 4 bottles</h3>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', margin: '12px 0' }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: i < playerBottles.length ? '#10b981' : '#e5e7eb', // Green if placed, Gray if empty
                    border: '1px solid #d1d5db',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: i < playerBottles.length ? 'scale(1.2)' : 'scale(1)'
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => autoPlace(setPlayerBottles)} style={{ padding: '6px 10px', borderRadius: '6px', background: '#06b6d4', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit' }}>Auto</button>
                <button onClick={() => setPlayerBottles([])} style={{ padding: '6px 10px', borderRadius: '6px', background: '#e5e7eb', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit' }}>Clear</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', maxWidth: '400px', margin: '0 auto 16px auto' }}>
              {ALL_CELLS.map((c) => (
                <button
                  key={c}
                  onClick={() => togglePlacement(c)}
                  style={{
                    padding: '0',
                    aspectRatio: '1',
                    minHeight: '60px',
                    borderRadius: '10px',
                    background: playerBottles.includes(c) ? '#f59e0b' : '#ffffff',
                    border: '2px solid #e5e7eb',
                    cursor: 'pointer',
                    fontSize: playerBottles.includes(c) ? 'clamp(20px, 5vw, 24px)' : 'clamp(12px, 3vw, 14px)',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'inherit'
                  }}
                >
                  {playerBottles.includes(c) ? '🧴' : c}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button onClick={finalizeSetup} style={{ padding: '12px 24px', borderRadius: '8px', background: '#4f46e5', color: 'white', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: 600, fontFamily: 'inherit' }}>
                {mode === 'online' ? (onlineGameData?.status === 'waiting' || message === 'Waiting for opponent...' ? 'Waiting...' : 'Join Game') : 'Start Match'}
              </button>
              <button onClick={() => { setScreen('menu'); resetAll(); }} style={{ padding: '12px 24px', borderRadius: '8px', background: '#e5e7eb', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: 600, fontFamily: 'inherit' }}>Cancel</button>
            </div>
            {mode === 'online' && message && <p style={{ textAlign: 'center', color: '#666', marginTop: 10 }}>{message}</p>}
          </div>
        )}

        {screen === 'setup-pass' && (
          <div style={{ background: 'rgba(255,255,255,0.95)', padding: '16px', borderRadius: '16px' }}>
            <h3 style={{ marginTop: 0, textAlign: 'center', color: '#10b981', fontSize: 'clamp(18px, 5vw, 20px)', fontWeight: 700 }}>{player1Name}: Place 4 bottles</h3>
            <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>Don't let {player2Name} see!</p>

            {/* Minimal Dot Indicator */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', margin: '12px 0' }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: i < playerBottles.length ? '#10b981' : '#e5e7eb',
                  border: '1px solid #d1d5db',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: i < playerBottles.length ? 'scale(1.2)' : 'scale(1)'
                }} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', maxWidth: '400px', margin: '0 auto 16px auto' }}>
              {ALL_CELLS.map((c) => (
                <button
                  key={c}
                  onClick={() => togglePlacement(c)}
                  style={{
                    padding: '0',
                    aspectRatio: '1',
                    minHeight: '60px',
                    borderRadius: '10px',
                    background: playerBottles.includes(c) ? '#f59e0b' : '#ffffff',
                    border: '2px solid #e5e7eb',
                    cursor: 'pointer',
                    fontSize: playerBottles.includes(c) ? 'clamp(20px, 5vw, 24px)' : 'clamp(12px, 3vw, 14px)',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'inherit'
                  }}
                >
                  {playerBottles.includes(c) ? '🧴' : c}
                </button>
              ))}
            </div>
            <button onClick={finalizeSetup} style={{ padding: '14px', borderRadius: '10px', background: '#10b981', color: 'white', border: 'none', cursor: 'pointer', width: '100%', fontSize: '16px', fontWeight: 600, fontFamily: 'inherit' }}>Done – Continue ➡️</button>
          </div>
        )}

        {screen === 'setup-pass-2' && (
          <div style={{ background: 'rgba(255,255,255,0.95)', padding: '16px', borderRadius: '16px' }}>
            <h3 style={{ marginTop: 0, textAlign: 'center', color: '#0ea5e9', fontSize: 'clamp(18px, 5vw, 20px)', fontWeight: 700 }}>{player2Name}: Place 4 bottles</h3>
            {/* Minimal Dot Indicator for Player 2 */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', margin: '12px 0' }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: i < tempSecondBottles.length ? '#10b981' : '#e5e7eb',
                  border: '1px solid #d1d5db',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: i < tempSecondBottles.length ? 'scale(1.2)' : 'scale(1)'
                }} />
              ))}
            </div>
            <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>Don't let {player1Name} see!</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', maxWidth: '400px', margin: '0 auto 16px auto' }}>
              {ALL_CELLS.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleSecond(c)}
                  style={{
                    padding: '0',
                    aspectRatio: '1',
                    minHeight: '60px',
                    borderRadius: '10px',
                    background: tempSecondBottles.includes(c) ? '#fbbf24' : '#ffffff',
                    border: '2px solid #e5e7eb',
                    cursor: 'pointer',
                    fontSize: tempSecondBottles.includes(c) ? 'clamp(20px, 5vw, 24px)' : 'clamp(12px, 3vw, 14px)',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'inherit'
                  }}
                >
                  {tempSecondBottles.includes(c) ? '🧴' : c}
                </button>
              ))}
            </div>
            <button onClick={finalizePassSecond} style={{ padding: '14px', borderRadius: '10px', background: '#4f46e5', color: 'white', border: 'none', cursor: 'pointer', width: '100%', fontSize: '16px', fontWeight: 600, fontFamily: 'inherit' }}>Start Game! 🎮</button>
          </div>
        )}

        {screen === 'guess' && (
          <div style={{ background: 'rgba(255,255,255,0.95)', padding: '12px', borderRadius: '16px', position: 'relative' }}>
            {winner && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(0,0,0,0.95)',
                color: 'white',
                padding: '24px',
                borderRadius: '16px',
                textAlign: 'center',
                zIndex: 100,
                width: '90%',
                maxWidth: '300px'
              }}>
                <h2 style={{ fontSize: 'clamp(22px, 6vw, 28px)', margin: '0 0 16px 0', fontWeight: 800 }}>
                  {mode === 'pass'
                    ? (winner === 1 ? `🎉 ${player1Name} Wins!` : `🎉 ${player2Name} Wins!`)
                    : mode === 'online'
                      ? (winner === 'player' ? `🎉 ${playerName} Wins!` : `💀 ${opponentName} Wins!`)
                      : (winner === 'player' ? `🎉 ${playerName} Wins!` : '😢 AI Wins!')
                  }
                </h2>
                <div style={{ marginTop: 20, display: 'flex', gap: '8px', flexDirection: 'column' }}>
                  <button
                    onClick={() => {
                      if (mode === 'online') leaveOnlineRoom();
                      else { resetAll(); setScreen('menu'); } // <--- Added setScreen('menu')
                    }}
                    style={{ padding: '12px', borderRadius: '8px', background: '#4f46e5', color: 'white', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: 600, fontFamily: 'inherit' }}
                  >
                    Main Menu
                  </button>
                  {/* Play Again Logic: Only Host sees button in Online Mode */}
                  {mode === 'online' && !isHost ? (
                    <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '14px', fontStyle: 'italic' }}>
                      ⏳ Waiting for Host to restart...
                    </div>
                  ) : (
                    <button onClick={handlePlayAgain} style={{ padding: '12px', borderRadius: '8px', background: '#10b981', color: 'white', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: 600, fontFamily: 'inherit' }}>
                      🔄 Play Again
                    </button>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '12px', textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: 'clamp(16px, 4vw, 18px)', fontWeight: 700 }}>
                {mode === 'online' ? 'Online Match' : mode === 'pass' ? `${player1Name} vs ${player2Name}` : `${playerName} VS AI`}
              </h3>
              <div style={{ color: '#6b7280', fontWeight: 600, fontSize: 'clamp(12px, 3vw, 14px)' }}>{message}</div>
            </div>

            {/* --- NEW TURN INDICATOR LOGIC --- */}
            {(() => {
              // Determine aesthetics based on whose turn it is
              let theme = { color: '#6b7280', text: 'Game Over', icon: '🏁', bg: '#f3f4f6' };

              if (!winner) {
                if (mode === 'pass') {
                  if (activePlayer === 1) theme = { color: '#4f46e5', text: `${player1Name}'s Turn`, icon: '👤', bg: '#eef2ff' }; // Player 1 Blue
                  else theme = { color: '#f59e0b', text: `${player2Name}'s Turn`, icon: '👤', bg: '#fffbeb' }; // Player 2 Orange
                } else {
                  // Online or AI Mode
                  if (currentTurn === 'player') {
                    theme = { color: '#10b981', text: `${playerName}'s TURN`, icon: '🟢', bg: '#ecfdf5' };
                  } else {
                    theme = {
                      color: '#ef4444',
                      // Show "AI Thinking" or "Real Name's Turn"
                      text: mode === 'ai' ? 'AI THINKING...' : `${opponentName}'s TURN`,
                      icon: '🛑',
                      bg: '#fef2f2'
                    };
                  }
                }
              }

              return (
                <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                  {/* Match Title */}
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {mode === 'online' ? 'Online Match' : mode === 'pass' ? 'PvP Match' : 'Single Player'}
                  </h3>

                  {/* THE BIG ANIMATED BANNER */}
                  <div style={{
                    background: theme.bg,
                    border: `2px solid ${theme.color}`,
                    color: theme.color,
                    padding: '16px',
                    borderRadius: '12px',
                    boxShadow: `0 4px 12px ${theme.color}33`, // 33 is opacity
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    transform: 'scale(1)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    animation: !winner ? 'pulse-border 2s infinite' : 'none'
                  }}>
                    <span style={{ fontSize: '24px', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))' }}>{theme.icon}</span>
                    <span style={{ fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {theme.text}
                    </span>
                  </div>

                  {/* Small Status Message (Hit/Miss feedback) */}
                  <div style={{
                    marginTop: '8px',
                    height: '20px',
                    color: message.includes('Hit') ? '#10b981' : '#6b7280',
                    fontWeight: 600,
                    fontSize: '14px',
                    opacity: message ? 1 : 0,
                    transition: 'opacity 0.2s'
                  }}>
                    {message}
                  </div>

                  {/* Animation Styles */}
                  <style>{`
            @keyframes pulse-border {
              0% { box-shadow: 0 0 0 0px ${theme.color}40; transform: scale(1); }
              50% { box-shadow: 0 0 0 6px ${theme.color}00; transform: scale(1.02); }
              100% { box-shadow: 0 0 0 0px ${theme.color}00; transform: scale(1); }
            }
          `}</style>
                </div>
              );
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth >= 640 ? '1fr 0fr 1fr' : '1fr', gap: '16px', maxWidth: '800px', margin: '0 auto' }}>
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 'clamp(13px, 3.5vw, 14px)', fontWeight: 700, textAlign: 'center', color: '#0ea5e9' }}>
                  🎯 Opponent's Board
                  {mode === 'online' && currentTurn === 'player' && ' (Tap to Attack)'}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {ALL_CELLS.map((c, i) => {
                    const state = (mode === 'pass' && activePlayer === 2) ? opponentGrid[i] : playerGrid[i]; return (
                      <button
                        key={c}
                        onClick={() => playerGuess(c)}
                        disabled={winner || (mode === 'online' && currentTurn !== 'player')}
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          padding: 0,
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: state ? '20px' : '12px',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          transition: 'transform 0.1s, background 0.2s',
                          border: 'none',
                          cursor: winner || (mode === 'online' && currentTurn !== 'player') ? 'default' : 'pointer',
                          background: state === 'hit' ? '#10b981' : state === 'miss' ? '#e5e7eb' : '#ffffff',
                          color: state === 'hit' ? '#ffffff' : state === 'miss' ? '#6b7280' : '#1f2937',
                          fontFamily: 'inherit',
                          opacity: (mode === 'online' && currentTurn !== 'player') ? 0.7 : 1
                        }}
                        onMouseDown={(e) => !winner && (e.currentTarget.style.transform = 'scale(0.95)')}
                        onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                      >
                        <span style={{ display: 'inline-block', animation: state ? 'popIn 0.3s' : 'none' }}>
                          {state === "hit" ? '💥' : state === "miss" ? '⭕' : c}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {window.innerWidth >= 640 && (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'linear-gradient(to bottom, transparent, #d1d5db, transparent)' }} />
                  <span style={{ background: 'rgba(255,255,255,0.95)', padding: '8px', fontSize: '14px', fontWeight: 600, color: '#9ca3af', zIndex: 1 }}>VS</span>
                </div>
              )}

              {window.innerWidth < 640 && (
                <div style={{ position: 'relative', padding: '12px 0' }}>
                  <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'linear-gradient(to right, transparent, #d1d5db, transparent)' }} />
                  <div style={{ position: 'relative', textAlign: 'center' }}>
                    <span style={{ background: 'rgba(255,255,255,0.95)', padding: '4px 12px', fontSize: '12px', fontWeight: 600, color: '#9ca3af' }}>VS</span>
                  </div>
                </div>
              )}

              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 'clamp(13px, 3.5vw, 14px)', fontWeight: 700, textAlign: 'center', color: '#10b981' }}>🛡️ Your Board</h4>                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {ALL_CELLS.map((c, i) => {
                    const state = (mode === 'pass' && activePlayer === 2) ? playerGrid[i] : opponentGrid[i];
                    const hasBottle = (mode === 'pass' && activePlayer === 2) ? opponentBottles.includes(c) : playerBottles.includes(c);
                    return (
                      <div
                        key={c}
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          padding: 0,
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: state ? '20px' : hasBottle ? '20px' : '12px',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          background: state === 'hit' ? '#ef4444' : state === 'miss' ? '#e5e7eb' : '#ffffff',
                          color: state === 'hit' ? '#ffffff' : state === 'miss' ? '#6b7280' : '#1f2937',
                          fontFamily: 'inherit'
                        }}
                      >
                        <span style={{ display: 'inline-block', animation: state ? 'popIn 0.3s' : 'none' }}>
                          {state === "hit" ? '💥' : state === "miss" ? '⭕' : hasBottle ? '🧴' : c}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '12px', textAlign: 'center' }}>
              <button
                onClick={() => {
                  if (mode === 'online') leaveOnlineRoom();
                  else { resetAll(); setScreen('menu'); } // <--- Added setScreen('menu')
                }}
                style={{ padding: '10px 20px', borderRadius: '8px', background: '#e5e7eb', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit' }}>
                Exit
              </button>
            </div>
            <style>{`
              @keyframes popIn {
                0% { transform: scale(0.5); opacity: 0; }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); opacity: 1; }
              }
            `}</style>


            {/* --- EMOTE UI LAYER --- */}
            {mode === 'online' && (
              <>
                {/* 1. The Active Emote Bubble */}
                {activeEmote && (
                  <div style={{
                    position: 'fixed', // Fixed positioning to float over everything
                    top: activeEmote.isMine ? 'auto' : '100px', // Opponent: Top Left
                    bottom: activeEmote.isMine ? '100px' : 'auto', // Mine: Bottom Right (above button)
                    left: activeEmote.isMine ? 'auto' : '20px',
                    right: activeEmote.isMine ? '20px' : 'auto',
                    background: activeEmote.isMine ? '#4f46e5' : '#ffffff',
                    color: activeEmote.isMine ? '#ffffff' : '#1f2937',
                    padding: '12px 20px',
                    borderRadius: '24px',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                    fontWeight: 700,
                    fontSize: '16px',
                    zIndex: 2000, // Ensure it's on top of game board
                    animation: 'emotePopIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    border: activeEmote.isMine ? 'none' : '2px solid #e5e7eb',
                    pointerEvents: 'none', // Click-through so it doesn't block game
                    maxWidth: '200px',
                    textAlign: 'center'
                  }}>
                    {activeEmote.text}
                  </div>
                )}

                {/* 2. The Floating Chat Button */}
                <button
                  onClick={() => setShowEmoteMenu(!showEmoteMenu)}
                  style={{
                    position: 'fixed', bottom: '20px', right: '20px',
                    width: '56px', height: '56px', borderRadius: '50%',
                    background: '#ffffff', border: '2px solid #e5e7eb',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    fontSize: '24px', cursor: 'pointer', zIndex: 150,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'transform 0.1s'
                  }}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  💬
                </button>

                {/* 3. The Popup Menu */}
                {showEmoteMenu && (
                  <div style={{
                    position: 'fixed', bottom: '90px', right: '20px',
                    background: 'white', borderRadius: '16px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                    padding: '12px', zIndex: 150,
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
                    animation: 'emoteSlideUp 0.2s ease-out'
                  }}>
                    {EMOTES.map((msg) => (
                      <button
                        key={msg}
                        onClick={() => sendEmote(msg)}
                        style={{
                          padding: '12px 16px', borderRadius: '8px',
                          border: '1px solid #f3f4f6', background: '#ffffff',
                          cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                          color: '#374151', textAlign: 'left',
                          transition: 'background 0.1s'
                        }}
                      >
                        {msg}
                      </button>
                    ))}
                  </div>
                )}

                {/* Animations (Renamed to avoid conflicts) */}
                <style>{`
                  @keyframes emotePopIn {
                    from { transform: scale(0.5); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                  }
                  @keyframes emoteSlideUp {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                `}</style>
              </>
            )}
          </div>
        )}

        {screen === 'online-setup' && (
          <div style={{ background: 'rgba(255,255,255,0.95)', padding: '20px', borderRadius: '16px', maxWidth: '500px', margin: '0 auto' }}>
            <h3 style={{ fontSize: 'clamp(18px, 5vw, 22px)', fontWeight: 700, marginBottom: '12px', textAlign: 'center' }}>🌐 Play Online</h3>
            <p style={{ color: '#6b7280', textAlign: 'center', marginBottom: '16px', fontSize: '14px' }}>
              Create or join a room!
            </p>

            <div style={{ background: '#f3f4f6', padding: '14px', borderRadius: '12px', marginBottom: '12px' }}>
              <h4 style={{ fontSize: '15px', margin: '0 0 6px 0', fontWeight: 700 }}>Create Room</h4>
              <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#6b7280' }}>Get a code to share</p>
              <button
                onClick={createRoom}
                style={{ padding: '12px', borderRadius: '8px', background: 'linear-gradient(90deg,#fb923c,#ef4444)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '15px', width: '100%', fontWeight: 600, fontFamily: 'inherit' }}
              >
                Create 🎮
              </button>
            </div>

            <div style={{ textAlign: 'center', margin: '12px 0', color: '#9ca3af', fontWeight: 600, fontSize: '14px' }}>OR</div>

            <div style={{ background: '#f3f4f6', padding: '14px', borderRadius: '12px', marginBottom: '12px' }}>
              <h4 style={{ fontSize: '15px', margin: '0 0 6px 0', fontWeight: 700 }}>Join Room</h4>
              <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#6b7280' }}>Enter friend's code</p>
              <input
                type="text"
                value={joinRoomInput}
                onChange={(e) => setJoinRoomInput(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '2px solid #e5e7eb', fontSize: '16px', marginBottom: '10px', textAlign: 'center', letterSpacing: '2px', fontWeight: 600, boxSizing: 'border-box', fontFamily: 'inherit' }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') joinRoom();
                }}
              />
              <button
                onClick={joinRoom}
                style={{ padding: '12px', borderRadius: '8px', background: '#10b981', color: 'white', border: 'none', cursor: 'pointer', fontSize: '15px', width: '100%', fontWeight: 600, fontFamily: 'inherit' }}
              >
                Join 🚪
              </button>
            </div>

            <button
              onClick={() => setScreen('menu')}
              style={{ padding: '10px', borderRadius: '8px', background: '#e5e7eb', border: 'none', cursor: 'pointer', width: '100%', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit' }}
            >
              Back
            </button>
          </div>
        )}

        {screen === 'online-waiting' && (
          <div style={{ background: 'rgba(255,255,255,0.95)', padding: '20px', borderRadius: '16px', maxWidth: '500px', margin: '0 auto' }}>
            <h3 style={{ fontSize: 'clamp(18px, 5vw, 22px)', fontWeight: 700, marginBottom: '12px', textAlign: 'center', color: onlineGameData?.guest ? '#10b981' : '#3730a3' }}>
              {onlineGameData?.guest ? '✅ Opponent Joined!' : '⏳ Waiting...'}
            </h3>

            <div style={{ background: '#f3f4f6', padding: '14px', borderRadius: '12px', marginBottom: '12px' }}>
              <p style={{ margin: '0 0 6px 0', fontWeight: 600, color: '#374151', fontSize: '13px' }}>Room Code:</p>
              <div style={{ background: 'white', padding: '14px', borderRadius: '8px', fontSize: 'clamp(22px, 6vw, 28px)', fontWeight: 800, textAlign: 'center', color: '#3730a3', letterSpacing: '3px' }}>
                {roomCode}
              </div>
            </div>

            {!onlineGameData?.guest && (
              <>
                <div style={{ background: '#fef3c7', padding: '14px', borderRadius: '12px', marginBottom: '12px' }}>
                  <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#92400e', fontWeight: 600 }}>
                    📋 Share: <strong>{roomCode}</strong>
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(roomCode);
                      alert('Copied!');
                    }}
                    style={{ padding: '10px', borderRadius: '8px', background: '#fbbf24', color: 'white', border: 'none', cursor: 'pointer', width: '100%', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit' }}
                  >
                    📋 Copy Code
                  </button>
                </div>
                <div style={{ textAlign: 'center', padding: '16px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '8px' }}>⏳</div>
                  <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Waiting for opponent...</p>
                </div>
              </>
            )}

            <button
              onClick={async () => {
                // If we cancel while waiting, we should probably just destroy/abandon the room so it doesn't stay open
                if (roomCode) {
                  const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'bottleship', roomCode);
                  await updateDoc(gameRef, { status: 'abandoned' });
                }
                resetAll();
                setScreen('menu');
              }}
              style={{ padding: '10px', borderRadius: '8px', background: '#e5e7eb', border: 'none', cursor: 'pointer', width: '100%', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit' }}
            >
              Cancel
            </button>
          </div>
        )}

      </div>

      {/* NEW: Opponent Left Modal */}
      {showOpponentLeft && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.5)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.2s'
        }}>
          <div style={{
            background: 'white', padding: '24px', borderRadius: '16px',
            maxWidth: '300px', textAlign: 'center',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚪</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 700, color: '#1f2937' }}>Opponent Left</h3>
            <p style={{ margin: '0 0 20px 0', color: '#6b7280', fontSize: '15px' }}>
              The other player has disconnected from the match.
            </p>
            <button
              onClick={() => {
                setShowOpponentLeft(false);
                resetAll();
                setScreen('menu');
              }}
              style={{
                width: '100%', padding: '12px', borderRadius: '8px',
                background: '#4f46e5', color: 'white', border: 'none',
                fontWeight: 600, cursor: 'pointer', fontSize: '16px'
              }}
            >
              Return to Menu
            </button>
          </div>
        </div>
      )}

    </div>
  );
}