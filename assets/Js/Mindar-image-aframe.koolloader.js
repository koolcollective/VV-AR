(function () {
  const LOTTIE_JSON_SRC = "assets/js/Loading_Animation.json";
  const MINDAR_SRC = "assets/js/Mindar-image-aframe.prod.js";
  const MIN_PLAYS = 3;

  // Optional: set to true while debugging
  const DEBUG = false;
  const log = (...a) => { if (DEBUG) console.log("[KC-LOADER]", ...a); };

  if (window.__KC_KOOLLOADER_V4__) return;
  window.__KC_KOOLLOADER_V4__ = true;

  // Load lottie-player web component (once)
  function ensureLottiePlayer() {
    if (window.customElements && window.customElements.get("lottie-player")) return;
    if (window.__KC_LOTTIE_SCRIPT__) return;
    window.__KC_LOTTIE_SCRIPT__ = true;

    const s = document.createElement("script");
    s.src = "https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js";
    s.defer = true;
    s.onload = () => log("lottie-player script loaded");
    s.onerror = () => console.warn("[KC-LOADER] Could not load lottie-player script (offline / blocked).");
    document.head.appendChild(s);
  }

  // Load MindAR (once)
  function ensureMindAR() {
    if (window.MINDAR || window.__MINDARE_LOADED__) return;
    window.__MINDARE_LOADED__ = true;

    const s = document.createElement("script");
    s.src = MINDAR_SRC;
    s.defer = true;
    s.onload = () => log("MindAR script loaded");
    s.onerror = () => console.error("[KC-LOADER] Failed to load MindAR script:", MINDAR_SRC);
    document.head.appendChild(s);
  }

  ensureLottiePlayer();
  ensureMindAR();

  // CSS: hide built-in spinner; style our overlay
  const style = document.createElement("style");
  style.textContent = `
    /* Hide MindAR's built-in spinner circle if it's present */
    .mindar-ui-loading .loader { display: none !important; }

    #kc-loading-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      opacity: 1;
      transition: opacity 300ms ease;
      pointer-events: auto;
    }
    #kc-loading-overlay.kc-hide {
      opacity: 0;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);

  // Gate conditions
  let playsDone = 0;
  let arReady = false;
  let overlayRemoved = false;

  function hideOverlay() {
    if (overlayRemoved) return;
    const overlay = document.getElementById("kc-loading-overlay");
    if (!overlay) return;
    overlay.classList.add("kc-hide");
    overlayRemoved = true;
    setTimeout(() => { try { overlay.remove(); } catch (_) {} }, 350);
  }

  function maybeFinish() {
    if (arReady && playsDone >= MIN_PLAYS) {
      log("Conditions met. Hiding overlay.", { playsDone, arReady });
      hideOverlay();
    }
  }

  // Attach to MindAR scene events (poll because A-Frame creates scene async)
  function hookARReadyEvents() {
    const scene = document.querySelector("a-scene");
    if (!scene) return false;
    if (scene.__KC_AR_HOOKED__) return true;
    scene.__KC_AR_HOOKED__ = true;

    scene.addEventListener("arReady", () => {
      arReady = true;
      log("arReady fired");
      maybeFinish();
    });
    scene.addEventListener("arError", (e) => {
      console.error("[KC-LOADER] MindAR arError:", e);
    });
    return true;
  }

  // Create overlay and run the minimum-plays loop
  window.addEventListener("DOMContentLoaded", async () => {
    log("DOMContentLoaded");

    // Build overlay
    const overlay = document.createElement("div");
    overlay.id = "kc-loading-overlay";
    // Keep MindAR classes for compatibility (but we override its visuals)
    overlay.className = "mindar-ui-overlay mindar-ui-loading";

    // If lottie-player is blocked/offline, show a simple fallback text
    const fallback = document.createElement("div");
    fallback.style.fontFamily = "sans-serif";
    fallback.style.letterSpacing = "2px";
    fallback.style.color = "#555";
    fallback.style.fontSize = "13px";
    fallback.textContent = "LOADING…";

    // Create lottie-player element (will upgrade when component loads)
    const player = document.createElement("lottie-player");
    player.id = "kc-loader";
    player.setAttribute("src", LOTTIE_JSON_SRC);
    player.setAttribute("background", "transparent");
    player.setAttribute("speed", "1");
    player.setAttribute("style", "width:200px;height:200px");
    // We control looping ourselves
    player.removeAttribute("loop");
    player.setAttribute("autoplay", "");

    overlay.appendChild(player);
    overlay.appendChild(fallback);
    document.body.appendChild(overlay);

    // Hide fallback once player upgrades successfully
    const hideFallback = () => { fallback.style.display = "none"; };

    // Wait briefly for custom element definition; don't block forever
    try {
      if (window.customElements?.whenDefined) {
        await Promise.race([
          window.customElements.whenDefined("lottie-player"),
          new Promise((res) => setTimeout(res, 2500)),
        ]);
      }
    } catch (_) {}

    // If upgraded, it will have methods like play/seek; hide fallback
    if (typeof player.play === "function") hideFallback();

    // Force 3 consecutive plays
    let lastEventAt = 0;
    const onDone = () => {
      const now = Date.now();
      // debounce duplicate events
      if (now - lastEventAt < 120) return;
      lastEventAt = now;

      playsDone += 1;
      log("Animation done:", playsDone);

      if (playsDone < MIN_PLAYS) {
        try { player.seek(0); } catch (_) {}
        try { player.play(); } catch (_) {}
      } else {
        maybeFinish();
      }
    };

    // Different builds of lottie-player use different event names
    player.addEventListener("complete", onDone);
    player.addEventListener("finish", onDone);
    player.addEventListener("loopComplete", onDone);

    // Kickstart if autoplay didn't start
    setTimeout(() => { try { player.play(); } catch (_) {} }, 100);

    // Poll for scene to hook arReady
    if (!hookARReadyEvents()) {
      const start = Date.now();
      const timer = setInterval(() => {
        if (hookARReadyEvents() || Date.now() - start > 8000) clearInterval(timer);
      }, 50);
    }

    // Safety: if arReady already happened before we hooked, allow hide after MIN_PLAYS + small delay
    // (Some setups fire quickly; we don't want to get stuck.)
    setTimeout(() => {
      // If AR is ready but event missed, user will see AR behind overlay anyway; we can still remove after 12s.
      if (!arReady) {
        // check if MindAR has started by looking for video element commonly used by MindAR
        const hasVideo = !!document.querySelector("video");
        if (hasVideo) {
          arReady = true;
          log("Fallback inferred arReady from video presence");
          maybeFinish();
        }
      }
    }, 3000);
  });
})();
