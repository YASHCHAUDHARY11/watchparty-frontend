import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Copy, Check, LogOut, Users, Film, Wifi, WifiOff } from "lucide-react";
import WatchRoom from "./WatchRoom.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function App() {
  const socketRef = useRef(null);
  if (!socketRef.current) {
    socketRef.current = io(BACKEND_URL, { autoConnect: true });
  }
  const socket = socketRef.current;

  const [connected, setConnected] = useState(socket.connected);
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomData, setRoomData] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("room");
    if (code) setRoomCode(code.toUpperCase().slice(0, 6));
  }, []);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onUserJoined = ({ room }) => room && setRoomData(room);
    const onUserLeft = ({ room }) => room && setRoomData(room);
    const onHostChanged = ({ hostId }) =>
      setRoomData((prev) => (prev ? { ...prev, hostId } : prev));

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);
    socket.on("host_changed", onHostChanged);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);
      socket.off("host_changed", onHostChanged);
    };
  }, [socket]);

  const enterRoom = (name) => (res) => {
    setBusy(false);
    if (!res?.ok) return setError(res?.error || "Something went wrong");
    setError("");
    setCurrentUser({ id: res.yourId, username: name });
    setRoomData(res.room);
    window.history.replaceState(null, "", `?room=${res.room.roomId}`);
  };

  const handleCreate = () => {
    const name = username.trim();
    if (!name) return setError("Enter a nickname first");
    setBusy(true);
    socket.emit("create_room", { username: name }, enterRoom(name));
  };

  const handleJoin = () => {
    const name = username.trim();
    if (!name) return setError("Enter a nickname first");
    if (roomCode.length !== 6) return setError("Room code must be 6 characters");
    setBusy(true);
    socket.emit("join_room", { roomId: roomCode, username: name }, enterRoom(name));
  };

  const handleLeave = () => {
    socket.disconnect();
    socket.connect();
    setRoomData(null);
    setCurrentUser(null);
    setRoomCode("");
    window.history.replaceState(null, "", window.location.pathname);
  };

  const copyInvite = async () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${roomData.roomId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this invite link:", link);
    }
  };

  const badge = (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        connected ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
      }`}
    >
      {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
      {connected ? "Server Ready" : "Waking up server (~45s)..."}
    </div>
  );

  if (roomData && currentUser) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-zinc-950 text-zinc-50">
        <header className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
          <span className="rounded bg-zinc-800 px-2 py-1 font-mono font-semibold tracking-widest">
            {roomData.roomId}
          </span>
          <button
            onClick={copyInvite}
            className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-xs font-medium active:bg-indigo-700"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy Invite Link"}
          </button>
          <span className="ml-auto flex items-center gap-1 text-zinc-300">
            <Users size={14} />
            {roomData.users.length}
          </span>
          <button
            onClick={handleLeave}
            className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs font-medium active:bg-red-700"
          >
            <LogOut size={14} />
            Leave
          </button>
        </header>
        <main className="flex flex-1 flex-col">
          <WatchRoom socket={socket} roomData={roomData} currentUser={currentUser} />
        </main>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-zinc-50 outline-none focus:border-indigo-500";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950 p-4 text-zinc-50">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex flex-col items-center gap-3">
          <Film size={40} className="text-indigo-400" />
          <h1 className="text-2xl font-bold">WatchParty</h1>
          {badge}
        </div>

        <input
          className={inputClass}
          placeholder="Nickname"
          maxLength={24}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className={`${inputClass} text-center font-mono uppercase tracking-[0.4em]`}
          placeholder="ROOM CODE"
          maxLength={6}
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
        />

        {error && <p className="text-center text-sm text-red-400">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleCreate}
            disabled={!connected || busy}
            className="rounded-lg bg-indigo-600 py-3 font-semibold disabled:opacity-40 active:bg-indigo-700"
          >
            Create Room
          </button>
          <button
            onClick={handleJoin}
            disabled={!connected || busy}
            className="rounded-lg bg-zinc-800 py-3 font-semibold disabled:opacity-40 active:bg-zinc-700"
          >
            Join Room
          </button>
        </div>
      </div>
    </div>
  );
}
