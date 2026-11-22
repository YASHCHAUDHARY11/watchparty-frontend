import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Headphones, PhoneOff, Volume2, MessageCircle, X, Send } from "lucide-react";

const EMOJIS = ["❤️", "😂", "😱", "🔥"];
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const IS_IOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const plain = (d) => ({ type: d.type, sdp: d.sdp });
const round = "flex h-9 w-9 items-center justify-center rounded-full text-white";
const dark = "bg-black/60 active:bg-black/80";
const panelCls =
  "absolute inset-x-2 bottom-14 z-40 max-h-[calc(100%-4.5rem)] overflow-y-auto rounded-xl bg-zinc-900/90 p-3 text-zinc-50";

export default function VoiceAndChat({ socket, roomData, videoRef }) {
  const peersRef = useRef({});
  const localRef = useRef(null);
  const ctxRef = useRef(null);
  const gainRef = useRef(null);
  const voiceRef = useRef(1);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const msgTimer = useRef(null);

  const [panel, setPanel] = useState(null);
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [remotes, setRemotes] = useState([]);
  const [movieVol, setMovieVol] = useState(1);
  const [voice, setVoice] = useState(1);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const [floats, setFloats] = useState([]);
  const [msg, setMsg] = useState("");

  const flash = (t) => {
    setMsg(t);
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(""), 4000);
  };

  const ensureAudio = () => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!ctxRef.current && Ctx) {
      const c = new Ctx();
      const g = c.createGain();
      g.gain.value = Math.max(0, voiceRef.current - 1);
      g.connect(c.destination);
      ctxRef.current = c;
      gainRef.current = g;
    }
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  };

  const closePeer = (id) => {
    const p = peersRef.current[id];
    if (!p) return;
    try { if (p.node) p.node.disconnect(); } catch {}
    p.pc.onicecandidate = null;
    p.pc.ontrack = null;
    p.pc.close();
    delete peersRef.current[id];
    setRemotes((r) => r.filter((x) => x.id !== id));
  };

  const makePeer = (id) => {
    closePeer(id);
    const pc = new RTCPeerConnection(ICE);
    const peer = { pc, queue: [], node: null };
    peersRef.current[id] = peer;
    const local = localRef.current;
    if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("webrtc_ice_candidate", { toSocketId: id, candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      const ctx = ensureAudio();
      if (ctx) {
        try {
          if (peer.node) peer.node.disconnect();
          peer.node = ctx.createMediaStreamSource(stream);
          peer.node.connect(gainRef.current);
        } catch {}
      }
      setRemotes((r) => [...r.filter((x) => x.id !== id), { id, stream }]);
    };
    return peer;
  };

  const flush = async (peer) => {
    for (const c of peer.queue.splice(0)) {
      try { await peer.pc.addIceCandidate(c); } catch {}
    }
  };

  const callPeer = async (id) => {
    const { pc } = makePeer(id);
    try {
      await pc.setLocalDescription(await pc.createOffer());
      socket.emit("webrtc_offer", { toSocketId: id, offer: plain(pc.localDescription) });
    } catch {}
  };

  const onOffer = async ({ fromSocketId: id, offer }) => {
    let peer = peersRef.current[id];
    const glare = peer && peer.pc.signalingState === "have-local-offer";
    if (glare && socket.id > id) return; // impolite side ignores, polite side accepts
    if (!peer || !glare) peer = makePeer(id);
    try {
      await peer.pc.setRemoteDescription(offer);
      await flush(peer);
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      socket.emit("webrtc_answer", { toSocketId: id, answer: plain(peer.pc.localDescription) });
    } catch {}
  };

  const onAnswer = async ({ fromSocketId: id, answer }) => {
    const peer = peersRef.current[id];
    if (!peer || peer.pc.signalingState !== "have-local-offer") return;
    try {
      await peer.pc.setRemoteDescription(answer);
      await flush(peer);
    } catch {}
  };

  const onCandidate = async ({ fromSocketId: id, candidate }) => {
    const peer = peersRef.current[id];
    if (!peer || !candidate) return;
    if (peer.pc.remoteDescription) {
      try { await peer.pc.addIceCandidate(candidate); } catch {}
    } else {
      peer.queue.push(candidate);
    }
  };

  useEffect(() => {
    const onChat = (m) => {
      setMessages((list) => [...list.slice(-49), m]);
      if (panelRef.current !== "chat" && m.from !== socket.id) setUnread((n) => n + 1);
    };
    const onEmoji = ({ emoji, username }) => {
      const key = `${Date.now()}-${Math.random()}`;
      setFloats((f) => [...f.slice(-14), { key, emoji, username, x: 8 + Math.random() * 70 }]);
      setTimeout(() => setFloats((f) => f.filter((x) => x.key !== key)), 3000);
    };
    const resume = () => {
      const c = ctxRef.current;
      if (c && c.state === "suspended") c.resume().catch(() => {});
    };
    socket.on("chat_message", onChat);
    socket.on("emoji_reaction", onEmoji);
    socket.on("webrtc_offer", onOffer);
    socket.on("webrtc_answer", onAnswer);
    socket.on("webrtc_ice_candidate", onCandidate);
    window.addEventListener("touchend", resume);
    window.addEventListener("click", resume);
    return () => {
      socket.off("chat_message", onChat);
      socket.off("emoji_reaction", onEmoji);
      socket.off("webrtc_offer", onOffer);
      socket.off("webrtc_answer", onAnswer);
      socket.off("webrtc_ice_candidate", onCandidate);
      window.removeEventListener("touchend", resume);
      window.removeEventListener("click", resume);
      clearTimeout(msgTimer.current);
      if (localRef.current) localRef.current.getTracks().forEach((t) => t.stop());
      Object.keys(peersRef.current).forEach(closePeer);
      if (ctxRef.current) ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
      gainRef.current = null;
      localRef.current = null;
    };
  }, [socket]);

  useEffect(() => {
    const ids = roomData.users.map((u) => u.id).filter((id) => id !== socket.id);
    Object.keys(peersRef.current).forEach((id) => {
      if (!ids.includes(id)) closePeer(id);
    });
    if (joined) ids.forEach((id) => !peersRef.current[id] && callPeer(id));
  }, [roomData.users, joined]);

  useEffect(() => {
    panelRef.current = panel;
    if (panel === "chat") setUnread(0);
  }, [panel]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, panel]);

  const joinVoice = async () => {
    ensureAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return flash("Microphone needs a secure (https) connection.");
    }
    try {
      localRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setMuted(false);
      setJoined(true);
    } catch {
      flash("Microphone permission was denied.");
    }
  };

  const leaveVoice = () => {
    if (localRef.current) localRef.current.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    Object.keys(peersRef.current).forEach(closePeer);
    setJoined(false);
  };

  const toggleMute = () => {
    const next = !muted;
    if (localRef.current) localRef.current.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  const onMovie = (e) => {
    const v = Number(e.target.value);
    setMovieVol(v);
    if (videoRef.current) videoRef.current.volume = v;
  };

  const onVoice = (e) => {
    const v = Number(e.target.value);
    setVoice(v);
    voiceRef.current = v;
    if (gainRef.current) gainRef.current.gain.value = Math.max(0, v - 1);
  };

  const sendChat = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    socket.emit("chat_message", { text: t });
    setText("");
  };

  const toggle = (p) => {
    ensureAudio();
    setPanel((cur) => (cur === p ? null : p));
  };

  const reactions = EMOJIS.map((em) => (
    <button
      key={em}
      onClick={() => socket.emit("emoji_reaction", { emoji: em })}
      className={`${round} ${dark} text-lg`}
    >
      {em}
    </button>
  ));

  return (
    <>
      <style>
        {"@keyframes wp-float{from{transform:translateY(0) scale(.7);opacity:1}to{transform:translateY(-170px) scale(1.4);opacity:0}}"}
      </style>

      {remotes.map((r) => (
        <audio
          key={r.id}
          autoPlay
          ref={(el) => {
            if (!el) return;
            if (el.srcObject !== r.stream) el.srcObject = r.stream;
            el.muted = false;
            el.volume = Math.min(voiceRef.current, 1);
          }}
        />
      ))}

      <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
        {floats.map((f) => (
          <span
            key={f.key}
            className="absolute bottom-16 text-center"
            style={{ left: `${f.x}%`, animation: "wp-float 3s ease-out forwards" }}
          >
            <span className="block text-4xl">{f.emoji}</span>
            <span className="block text-[10px] text-white/80">{f.username}</span>
          </span>
        ))}
      </div>

      {msg && (
        <p className="absolute left-1/2 top-24 z-40 -translate-x-1/2 rounded bg-black/80 px-3 py-1 text-xs text-amber-300">
          {msg}
        </p>
      )}

      {!panel && (
        <div className="absolute bottom-14 right-2 z-30 flex flex-col items-end gap-1.5">
          <div className="flex gap-1.5">{reactions}</div>
          <div className="flex items-center gap-1.5">
            {joined && (
              <button
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
                className={`${round} ${muted ? "bg-red-600" : "bg-black/60"}`}
              >
                {muted ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            )}
            <button
              onClick={joined ? leaveVoice : joinVoice}
              className={`flex h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold text-white ${
                joined ? "bg-red-600/90" : "bg-emerald-600/90"
              }`}
            >
              {joined ? <PhoneOff size={14} /> : <Headphones size={14} />}
              {joined ? "Leave Voice" : "Join Voice"}
            </button>
            <button onClick={() => toggle("mixer")} aria-label="Audio mixer" className={`${round} ${dark}`}>
              <Volume2 size={16} />
            </button>
            <button onClick={() => toggle("chat")} aria-label="Chat" className={`${round} ${dark} relative`}>
              <MessageCircle size={16} />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1 text-[10px]">{unread}</span>
              )}
            </button>
          </div>
        </div>
      )}

      {panel === "mixer" && (
        <div className={panelCls}>
          <div className="mb-1 flex items-center justify-between">
            <b className="text-sm">Audio mixer</b>
            <button onClick={() => setPanel(null)} className={`${round} h-8 w-8 bg-zinc-700`}>
              <X size={14} />
            </button>
          </div>
          <label className="block text-xs text-zinc-300">
            Movie volume: {Math.round(movieVol * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={movieVol}
              onChange={onMovie}
              className="h-8 w-full accent-indigo-500"
            />
          </label>
          {IS_IOS && (
            <p className="mb-1 text-[11px] text-amber-300">
              iPhone and iPad Safari lock video volume to the hardware buttons, so this slider may do nothing here.
            </p>
          )}
          <label className="block text-xs text-zinc-300">
            Friend's voice: {Math.round(voice * 100)}%
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={voice}
              onChange={onVoice}
              className="h-8 w-full accent-emerald-500"
            />
          </label>
          <p className="text-[11px] text-zinc-400">
            {joined
              ? "Voice connected. Use earphones to avoid echo, and keep voice at 100% or less on speaker."
              : "Tap Join Voice to talk with friends."}
          </p>
        </div>
      )}

      {panel === "chat" && (
        <div className={`${panelCls} flex flex-col gap-2`}>
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">{reactions}</div>
            <button onClick={() => setPanel(null)} className={`${round} h-8 w-8 bg-zinc-700`}>
              <X size={14} />
            </button>
          </div>
          <div ref={listRef} className="max-h-24 min-h-0 flex-1 space-y-1 overflow-y-auto text-sm">
            {messages.length === 0 && <p className="text-xs text-zinc-400">No messages yet. Say hi!</p>}
            {messages.map((m) => (
              <p key={m.id} className="break-words leading-snug">
                <b className={m.from === socket.id ? "text-emerald-300" : "text-indigo-300"}>{m.username}: </b>
                {m.text}
              </p>
            ))}
          </div>
          <form onSubmit={sendChat} className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="Say something..."
              className="min-w-0 flex-1 rounded-lg border border-zinc-600 bg-black/40 px-3 py-2 text-base text-zinc-50 outline-none focus:border-indigo-500"
            />
            <button type="submit" aria-label="Send" className="rounded-lg bg-indigo-600 px-3 text-white active:bg-indigo-700">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
