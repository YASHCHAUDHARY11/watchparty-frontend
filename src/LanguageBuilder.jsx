import { useState } from "react";
import { Languages, Plus, Share2, X } from "lucide-react";

const LANGS = [
  "Hindi", "English", "Tamil", "Telugu", "Bengali", "Marathi",
  "Malayalam", "Kannada", "Spanish", "Korean", "Japanese",
];

export default function LanguageBuilder({ onShare, convert }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState("Hindi");
  const [url, setUrl] = useState("");
  const [rows, setRows] = useState([]);

  const add = () => {
    if (!url.trim()) return;
    const link = convert(url);
    setRows((r) => [...r.filter((x) => x.lang !== lang), { lang, link }]);
    setUrl("");
  };

  const remove = (l) => setRows((r) => r.filter((x) => x.lang !== l));

  const share = () => {
    if (!rows.length) return;
    onShare(Object.fromEntries(rows.map((r) => [r.lang, r.link])));
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg bg-zinc-800 px-4 py-3 font-medium active:bg-zinc-700"
      >
        <Languages size={18} />
        Add movie in multiple languages
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg bg-zinc-900 p-3">
      <div className="flex items-center justify-between">
        <b>Language versions</b>
        <button onClick={() => setOpen(false)} className="rounded-full bg-zinc-800 p-2">
          <X size={14} />
        </button>
      </div>
      <p className="text-xs text-zinc-400">
        Add one link per language of the same movie (YouTube, Dropbox, Drive or direct .mp4).
        Each person then picks their own language.
      </p>

      <div className="flex gap-2">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-3 text-base text-zinc-50"
        >
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste link"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-zinc-50 outline-none focus:border-indigo-500"
        />
        <button onClick={add} className="rounded-lg bg-zinc-700 px-3 active:bg-zinc-600">
          <Plus size={18} />
        </button>
      </div>

      {rows.map((r) => (
        <div key={r.lang} className="flex items-center gap-2 rounded bg-zinc-800 px-3 py-2">
          <b className="w-20 shrink-0">{r.lang}</b>
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{r.link}</span>
          <button onClick={() => remove(r.lang)} className="text-red-400">
            <X size={16} />
          </button>
        </div>
      ))}

      <button
        onClick={share}
        disabled={!rows.length}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 font-semibold disabled:opacity-40 active:bg-indigo-700"
      >
        <Share2 size={16} />
        Share with room
      </button>
    </div>
  );
}
