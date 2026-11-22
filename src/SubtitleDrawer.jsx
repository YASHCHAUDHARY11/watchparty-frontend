import { useEffect, useRef, useState } from "react";
import { Captions, X, Upload, Sparkles, Loader2, Minus, Plus, Trash2 } from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const LANGS = ["Hindi", "English", "Tamil", "Telugu", "Bengali", "Marathi", "Spanish", "Korean", "Japanese"];

// SRT -> WebVTT: normalize line breaks, swap timestamp commas for dots, add header
const toVtt = (text) => {
  const body = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .trim();
  return /^WEBVTT/.test(body) ? `${body}\n` : `WEBVTT\n\n${body}\n`;
};

export default function SubtitleDrawer({ videoRef }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState("Hindi");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasSubs, setHasSubs] = useState(false);

  const srcRef = useRef("");
  const urlRef = useRef(null);
  const trackRef = useRef(null);
  const cuesRef = useRef([]);
  const offsetRef = useRef(0);

  const clearTrack = () => {
    if (trackRef.current) trackRef.current.remove();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    trackRef.current = null;
    urlRef.current = null;
    cuesRef.current = [];
  };

  useEffect(() => clearTrack, []);

  const applyOffset = () => {
    cuesRef.current.forEach(({ cue, s, e }) => {
      const start = Math.max(0, s + offsetRef.current);
      cue.startTime = start;
      cue.endTime = Math.max(start + 0.05, e + offsetRef.current);
    });
  };

  const attachTrack = (vttText, label) => {
    const v = videoRef.current;
    if (!v) return setMsg("Video is not ready yet.");
    clearTrack();
    offsetRef.current = 0;
    setOffset(0);

    const url = URL.createObjectURL(new Blob([vttText], { type: "text/vtt" }));
    urlRef.current = url;

    const el = document.createElement("track");
    el.kind = "subtitles";
    el.label = label;
    el.srclang = "und";
    el.default = true;
    el.src = url;
    el.addEventListener("load", () => {
      const cues = el.track.cues ? Array.from(el.track.cues) : [];
      cuesRef.current = cues.map((cue) => ({ cue, s: cue.startTime, e: cue.endTime }));
      el.track.mode = "showing";
    });
    v.appendChild(el);
    trackRef.current = el;
    el.track.mode = "showing";
    setHasSubs(true);
    setMsg(`Showing: ${label}`);
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.(srt|vtt)$/i.test(file.name)) return setMsg("Please pick an .srt or .vtt file.");
    try {
      const text = await file.text();
      srcRef.current = text;
      attachTrack(toVtt(text), file.name);
    } catch {
      setMsg("Could not read that file.");
    }
  };

  const translate = async () => {
    if (!srcRef.current) return setMsg("Upload an .srt or .vtt file first.");
    setLoading(true);
    setMsg(`Translating to ${lang}...`);
    try {
      const res = await fetch(`${BACKEND_URL}/api/translate-subtitles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ srtText: srcRef.current, targetLanguage: lang }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const vttText = await res.text();
      attachTrack(vttText, `${lang} (AI)`);
    } catch (err) {
      setMsg(`Translation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const nudge = (delta) => {
    offsetRef.current = Math.round((offsetRef.current + delta) * 10) / 10;
    setOffset(offsetRef.current);
    applyOffset();
  };

  const removeSubs = () => {
    clearTrack();
    srcRef.current = "";
    offsetRef.current = 0;
    setOffset(0);
    setHasSubs(false);
    setMsg("Subtitles removed.");
  };

  const btn = "flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="absolute left-2 top-14 z-30 flex items-center gap-1 rounded-full bg-black/60 px-3 py-2 text-xs font-medium text-white active:bg-black/80"
      >
        <Captions size={16} />
        Subtitles / AI
      </button>

      {open && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-t-2xl bg-zinc-900 p-4 text-zinc-50 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-bold">
                <Captions size={18} /> Subtitles
              </h2>
              <button onClick={() => setOpen(false)} className="rounded-full bg-zinc-800 p-2">
                <X size={16} />
              </button>
            </div>

            <label className={`${btn} cursor-pointer bg-zinc-800 active:bg-zinc-700`}>
              <Upload size={16} />
              Upload .srt / .vtt
              <input type="file" accept=".srt,.vtt,text/vtt" onChange={onFile} className="hidden" />
            </label>

            <div className="flex gap-2">
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-zinc-50"
              >
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                onClick={translate}
                disabled={loading}
                className={`${btn} bg-indigo-600 active:bg-indigo-700 disabled:opacity-50`}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {loading ? "Translating" : "Translate with AI"}
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-zinc-800 p-2">
              <button
                onClick={() => nudge(-0.5)}
                disabled={!hasSubs}
                className={`${btn} bg-zinc-700 px-3 py-2 active:bg-zinc-600 disabled:opacity-40`}
              >
                <Minus size={14} /> 0.5s
              </button>
              <span className="font-mono text-sm">
                {offset > 0 ? "+" : ""}
                {offset.toFixed(1)}s
              </span>
              <button
                onClick={() => nudge(0.5)}
                disabled={!hasSubs}
                className={`${btn} bg-zinc-700 px-3 py-2 active:bg-zinc-600 disabled:opacity-40`}
              >
                <Plus size={14} /> 0.5s
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              Subtitles too early? Tap +0.5s to delay them. Too late? Tap -0.5s.
            </p>

            {hasSubs && (
              <button onClick={removeSubs} className={`${btn} w-full bg-zinc-800 text-red-400 active:bg-zinc-700`}>
                <Trash2 size={16} /> Remove subtitles
              </button>
            )}

            {msg && <p className="text-center text-xs text-amber-300">{msg}</p>}
          </div>
        </div>
      )}
    </>
  );
}
