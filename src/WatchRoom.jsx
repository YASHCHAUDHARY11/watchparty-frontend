import { useEffect, useRef, useState } from "react";
import { Play, Pause, Maximize, Minimize, Languages, Loader2, Crown, FolderOpen } from "lucide-react";
import SubtitleDrawer from "./SubtitleDrawer.jsx";
import VoiceAndChat from "./VoiceAndChat.jsx";
import YouTubePlayer from "./YouTubePlayer.jsx";

const ytId = (raw) => {
  const m = raw
    .trim()
    .match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};

const toStreamUrl = (raw) => {
  let url = raw.trim();
  const drive =
    url.match(/drive\.google\.com\/file\/d\/([\w-]+)/) ||
    url.match(/drive\.google\.com\/.*[?&]id=([\w-]+)/);
  if (drive) {
    return `https://drive.usercontent.google.com/download?id=${drive[1]}&export=download&confirm=t`;
  }
  if (/dropbox\.com/.test(url)) {
    url = url.replace(/[?&]dl=0/, "").replace(/[?&]raw=1/, "");
    return url + (url.includes("?") ? "&" : "?") + "raw=1";
  }
  return url.replace(/^http:\/\//, "https://");
};

const fmt = (s) => {
  if (!Number.isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

export default function WatchRoom({ socket, roomData, currentUser }) {
  const isHost = roomData.hostId === currentUser.id;
  const videoRef = useRef(null);
  const playerContainerRef = useRef(null);
  const seekRef = useRef(null);
  const timeRef = useRef(null);
  const dragging = useRef(false);
  const isRemoteSync = useRef(false);
  const syncTimer = useRef(null);
  const hideTimer = useRef(null);
  const bufTimer = useRef(null);
  const blobRef = useRef(null);
  const pendingSeek = useRef(null);

  const [src, setSrc] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [note, setNote] = useState("");
  const [playing, setPlaying] = useState(false);
  const [show, setShow] = useState(true);
  const [isFs, setIsFs] = useState(false);
  const [buffering, setBuffering] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [showAudio, setShowAudio] = useState(false);

  const isYt = src.startsWith("yt:");

  const remote = (fn) => {
    isRemoteSync.current = true;
    fn();
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => (isRemoteSync.current = false), 500);
  };

  const emit = (action, extra = {}) => {
    if (isRemoteSync.current) return;
    socket.emit("video_action", {
      action,
      time: videoRef.current ? videoRef.current.currentTime : 0,
      ...extra,
    });
  };

  const poke = () => {
    setShow(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShow(false);
    }, 3000);
  };

  const applySource = (source) => {
    if (source && source.startsWith("local:")) {
      setSrc("");
      setNote(`Host loaded "${source.slice(6)}". Pick the same file below to watch in sync.`);
    } else {
      setNote("");
      setSrc(source || "");
    }
  };

  useEffect(() => {
    const vs = roomData.videoState;
    if (vs && vs.source) {
      applySource(vs.source);
      pendingSeek.current = vs.currentTime || 0;
    }
    return () => blobRef.current && URL.revokeObjectURL(blobRef.current);
  }, []);

  useEffect(() => {
    const nameOf = (id) => roomData.users.find((u) => u.id === id)?.username || "Someone";
    const onAction = (p) => {
      const v = videoRef.current;
      if (p.action === "change_source") return remote(() => applySource(p.source));
      if (p.action === "buffering") {
        setBuffering(`${nameOf(p.from)} is buffering...`);
        clearTimeout(bufTimer.current);
        bufTimer.current = setTimeout(() => setBuffering(null), 5000);
        return;
      }
      if (!v) return;
      remote(() => {
        if (typeof p.time === "number" && Math.abs(v.currentTime - p.time) > 0.3) {
          v.currentTime = p.time;
        }
        if (p.action === "play") v.play().catch(() => {});
        if (p.action === "pause") v.pause();
      });
      if (p.action === "play") setBuffering(null);
    };
    const onBeat = (p) => {
      const v = videoRef.current;
      if (isHost || !v || !v.duration) return;
      if (v.paused) remote(() => v.play().catch(() => {}));
      const drift = p.time - v.currentTime;
      const abs = Math.abs(drift);
      if (abs > 2.5) {
        remote(() => (v.currentTime = p.time));
        v.playbackRate = 1;
      } else if (abs > 0.5) {
        v.playbackRate = drift > 0 ? 1.05 : 0.95;
      } else {
        v.playbackRate = 1;
      }
    };
    socket.on("video_action", onAction);
    socket.on("host_heartbeat", onBeat);
    return () => {
      socket.off("video_action", onAction);
      socket.off("host_heartbeat", onBeat);
    };
  }, [socket, roomData, isHost]);

  useEffect(() => {
    if (!isHost) return;
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused) socket.emit("host_heartbeat", { time: v.currentTime, playing: true });
    }, 3000);
    return () => clearInterval(id);
  }, [socket, isHost]);

  useEffect(() => {
    let raf;
    const tick = () => {
      const v = videoRef.current;
      if (v && v.duration && !dragging.current) {
        if (seekRef.current) seekRef.current.value = (v.currentTime / v.duration) * 1000;
        const label = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;
        if (timeRef.current && timeRef.current.textContent !== label) {
          timeRef.current.textContent = label;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const el = seekRef.current;
    const commit = () => {
      const v = videoRef.current;
      dragging.current = false;
      if (v && v.duration) v.currentTime = (el.value / 1000) * v.duration;
    };
    el.addEventListener("change", commit);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("change", commit);
    };
  }, []);

  useEffect(() => {
    const onFs = () => setIsFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  const toggleFs = () => {
    const el = playerContainerRef.current;
    if (isFs) {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
      else setIsFs(false);
      return;
    }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return setIsFs(true);
    const res = req.call(el);
    if (res && res.catch) res.catch(() => setIsFs(true));
  };

  const onScrub = () => {
    dragging.current = true;
    poke();
    const v = videoRef.current;
    if (v && v.duration && timeRef.current) {
      const t = (seekRef.current.value / 1000) * v.duration;
      timeRef.current.textContent = `${fmt(t)} / ${fmt(v.duration)}`;
    }
  };

  const onMeta = () => {
    const v = videoRef.current;
    if (!v) return;
    if (pendingSeek.current) {
      v.currentTime = pendingSeek.current;
      pendingSeek.current = null;
    }
    const at = v.audioTracks;
    if (at && at.length) {
      setTracks(
        Array.from({ length: at.length }, (_, i) => ({
          i,
          label: at[i].label || at[i].language || `Track ${i + 1}`,
          on: at[i].enabled,
        }))
      );
    } else {
      setTracks([]);
    }
  };

  const pickTrack = (idx) => {
    const at = videoRef.current.audioTracks;
    for (let i = 0; i < at.length; i++) at[i].enabled = i === idx;
    setTracks((prev) => prev.map((t) => ({ ...t, on: t.i === idx })));
  };

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    blobRef.current = URL.createObjectURL(f);
    setSrc(blobRef.current);
    setNote("");
    if (isHost) emit("change_source", { time: 0, source: `local:${f.name}` });
  };

  const loadUrl = () => {
    if (!urlInput.trim()) return;
    const id = ytId(urlInput);
    const url = id ? `yt:${id}` : toStreamUrl(urlInput);
    setNote(id ? "" : "Loading video...");
    setSrc(url);
    emit("change_source", { time: 0, source: url });
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (v && src) (v.paused ? v.play().catch(() => {}) : v.pause());
  };

  const handlers = {
    onPlay: () => { setPlaying(true); poke(); emit("play"); },
    onPause: () => { setPlaying(false); setShow(true); clearTimeout(hideTimer.current); emit("pause"); },
    onSeeked: () => emit("seek"),
    onWaiting: () => { setBuffering("Buffering..."); emit("buffering"); },
    onPlaying: () => setBuffering(null),
  };

  const bar = `absolute inset-x-0 z-20 flex items-center gap-2 px-3 py-2 transition-opacity duration-300 ${
    show ? "opacity-100" : "pointer-events-none opacity-0"
  }`;

  return (
    <div className="flex flex-1 flex-col bg-zinc-950">
      <div
        ref={playerContainerRef}
        onMouseMove={poke}
        className={`select-none bg-black ${
          isFs ? "fixed inset-0 z-50 h-[100dvh] w-screen" : "relative aspect-video w-full"
        }`}
      >
        {isYt ? (
          <YouTubePlayer
            videoId={src.slice(3)}
            videoRef={videoRef}
            onTap={() => (show ? setShow(false) : poke())}
            onMeta={onMeta}
            onError={() => setNote("This YouTube video can't be embedded. Try a different video.")}
            {...handlers}
          />
        ) : (
          <video
            ref={videoRef}
            src={src || undefined}
            playsInline
            className="h-full w-full bg-black object-contain"
            onClick={() => (show ? setShow(false) : poke())}
            onLoadedMetadata={onMeta}
            onCanPlay={() => { setBuffering(null); setNote(""); }}
            onError={() => {
              if (!src) return;
              setBuffering(null);
              setNote("This link can't be played. Check that it is public, is a direct .mp4/.webm link, and is not an MKV file. Large Google Drive files often fail; try Dropbox or a local file instead.");
            }}
            {...handlers}
          />
        )}

        {!src && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-400">
            {isHost ? "Load a movie below to start" : "Waiting for the host to load a movie..."}
          </p>
        )}

        {buffering && (
          <div className="absolute left-1/2 top-14 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-3 py-1 text-xs text-white">
            <Loader2 size={14} className="animate-spin" />
            {buffering}
          </div>
        )}

        <div onTouchStart={poke} className={`${bar} top-0 justify-between bg-gradient-to-b from-black/80 to-transparent`}>
          <span className="flex items-center gap-1 text-xs text-zinc-200">
            {isHost && <Crown size={14} className="text-amber-400" />}
            {isHost ? "You are the host" : "Synced to host"}
          </span>
          {!isYt && (
            <button onClick={() => setShowAudio((s) => !s)} className="rounded-full bg-white/15 p-2 text-white">
              <Languages size={18} />
            </button>
          )}
        </div>

        {showAudio && !isYt && (
          <div className="absolute right-2 top-14 z-30 w-60 rounded-lg bg-black/90 p-3 text-xs text-zinc-200">
            <p className="mb-2 font-semibold">Audio track (this device only)</p>
            {tracks.length > 1 ? (
              tracks.map((t) => (
                <button
                  key={t.i}
                  onClick={() => pickTrack(t.i)}
                  className={`mb-1 block w-full rounded px-2 py-2 text-left ${t.on ? "bg-indigo-600" : "bg-zinc-800"}`}
                >
                  {t.label}
                </button>
              ))
            ) : (
              <p className="text-zinc-400">
                No extra audio tracks detected. Mobile Chrome and Safari often block multi-audio
                MKV files. Try an MP4 with several tracks, or desktop Chrome, Edge or Safari.
              </p>
            )}
          </div>
        )}

        <div
          onTouchStart={poke}
          className={`${bar} bottom-0 bg-gradient-to-t from-black/80 to-transparent pb-[max(0.5rem,env(safe-area-inset-bottom))]`}
        >
          <button onClick={togglePlay} className="p-2 text-white">
            {playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <input
            ref={seekRef}
            type="range"
            min={0}
            max={1000}
            step={1}
            defaultValue={0}
            onInput={onScrub}
            className="h-8 flex-1 accent-indigo-500"
          />
          <span ref={timeRef} className="min-w-[5.5rem] text-right font-mono text-xs text-zinc-200">
            0:00 / 0:00
          </span>
          <button onClick={toggleFs} className="p-2 text-white">
            {isFs ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>

        {!isYt && <SubtitleDrawer videoRef={videoRef} />}
        <VoiceAndChat socket={socket} roomData={roomData} videoRef={videoRef} />
      </div>

      <div className="space-y-3 p-3 text-sm">
        {note && <p className="rounded-lg bg-amber-500/10 p-3 text-amber-300">{note}</p>}
        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-zinc-800 px-4 py-3 font-medium active:bg-zinc-700">
          <FolderOpen size={18} />
          {isHost ? "Load local file (no upload)" : "Load the same local file"}
          <input type="file" accept="video/*,.mkv" onChange={onFile} className="hidden" />
        </label>
        {isHost ? (
          <div className="flex gap-2">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="YouTube, Dropbox, Drive or direct .mp4 link"
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-base text-zinc-50 outline-none focus:border-indigo-500"
            />
            <button onClick={loadUrl} className="rounded-lg bg-indigo-600 px-4 font-semibold active:bg-indigo-700">
              Load
            </button>
          </div>
        ) : (
          <p className="text-zinc-500">Only the host can load a stream URL.</p>
        )}
      </div>
    </div>
  );
}
