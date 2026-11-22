import { useEffect, useRef } from "react";

let apiPromise;
const loadApi = () => {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        resolve(window.YT);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
  }
  return apiPromise;
};

export default function YouTubePlayer({ videoId, videoRef, onTap, ...handlers }) {
  const hostRef = useRef(null);
  const hRef = useRef(handlers);
  hRef.current = handlers;

  useEffect(() => {
    let player = null;
    let api = null;
    let dead = false;
    let last = -1;
    const call = (name) => hRef.current[name] && hRef.current[name]();

    loadApi().then((YT) => {
      if (dead || !hostRef.current) return;
      const mount = document.createElement("div");
      hostRef.current.appendChild(mount);
      player = new YT.Player(mount, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 0,
          playsinline: 1,
          rel: 0,
          fs: 0,
          disablekb: 1,
          modestbranding: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
            if (dead) return;
            api = {
              get currentTime() {
                return player.getCurrentTime() || 0;
              },
              set currentTime(t) {
                player.seekTo(t, true);
                setTimeout(() => call("onSeeked"), 150);
              },
              get duration() {
                return player.getDuration() || 0;
              },
              get paused() {
                const s = player.getPlayerState();
                return s !== 1 && s !== 3;
              },
              get volume() {
                return player.getVolume() / 100;
              },
              set volume(v) {
                player.setVolume(Math.round(v * 100));
              },
              get playbackRate() {
                return 1;
              },
              set playbackRate(r) {},
              play() {
                player.playVideo();
                return Promise.resolve();
              },
              pause() {
                player.pauseVideo();
              },
            };
            videoRef.current = api;
            call("onMeta");
          },
          onStateChange: (e) => {
            const s = e.data;
            if (s === 1) {
              if (last !== 1) call("onPlay");
              last = 1;
              call("onPlaying");
            } else if (s === 2 || s === 0) {
              if (last !== 2) call("onPause");
              last = 2;
            } else if (s === 3) {
              call("onWaiting");
            }
          },
          onError: () => call("onError"),
        },
      });
    });

    return () => {
      dead = true;
      if (api && videoRef.current === api) videoRef.current = null;
      try {
        if (player && player.destroy) player.destroy();
      } catch {}
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [videoId]);

  return (
    <>
      <div
        ref={hostRef}
        className="pointer-events-none h-full w-full bg-black [&>iframe]:h-full [&>iframe]:w-full"
      />
      <div onClick={onTap} className="absolute inset-0 z-10" />
    </>
  );
}
