export const VEXA_LIVE_CSS = `
:root {
  color-scheme: dark;
  --text: #ffffff;
  --muted: rgba(255, 255, 255, 0.48);
  --soft: rgba(255, 255, 255, 0.07);
  --line: rgba(255, 255, 255, 0.1);
  --card: rgba(13, 13, 13, 0.66);
  --font: "SF Pro Display", "SF Pro Text", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-family: var(--font);
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html,
body {
  margin: 0;
  width: 100%;
  min-height: 100%;
  background: #000000;
  color: var(--text);
  overscroll-behavior: none;
}

body {
  min-height: var(--tg-viewport-height, 100dvh);
  overflow-x: hidden;
}

button,
a {
  font: inherit;
}

button {
  border: 0;
}

.live-app {
  position: relative;
  isolation: isolate;
  width: min(100%, 560px);
  min-height: var(--tg-viewport-height, 100dvh);
  margin: 0 auto;
  padding: calc(18px + env(safe-area-inset-top)) 16px calc(22px + env(safe-area-inset-bottom));
  overflow: hidden;
}

.live-app::before {
  content: "";
  position: absolute;
  z-index: -2;
  top: 72px;
  left: 50%;
  width: 370px;
  height: 370px;
  border-radius: 50%;
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(255, 255, 255, 0.075), transparent 68%);
  filter: blur(8px);
  pointer-events: none;
}

.live-app::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  opacity: 0.16;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.014) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, #000000, transparent 78%);
}

.live-header {
  display: grid;
  grid-template-columns: 38px 1fr 38px;
  align-items: center;
  gap: 10px;
  height: 40px;
  animation: headerIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.live-back,
.live-mark {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  color: #ffffff;
  text-decoration: none;
  background: var(--card);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 -1px 0 rgba(255, 255, 255, 0.045),
    0 10px 26px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(12px) saturate(1.08);
  -webkit-backdrop-filter: blur(12px) saturate(1.08);
}

.live-back {
  transition: transform 0.2s cubic-bezier(0.2, 0.9, 0.2, 1), background 0.2s ease;
}

.live-back:active {
  transform: scale(0.88);
  background: rgba(255, 255, 255, 0.11);
}

.live-back svg {
  width: 19px;
  height: 19px;
}

.live-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 0;
}

.live-brand span {
  color: rgba(255, 255, 255, 0.34);
  font-size: 8px;
  font-weight: 780;
  letter-spacing: 0.18em;
}

.live-brand strong {
  color: #ffffff;
  font-size: 15px;
  font-weight: 760;
  letter-spacing: -0.035em;
}

.live-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.live-mark i {
  display: block;
  width: 2.5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  animation: markPulse 1.35s ease-in-out infinite;
}

.live-mark i:nth-child(1) {
  height: 8px;
  animation-delay: -0.18s;
}

.live-mark i:nth-child(2) {
  height: 14px;
}

.live-mark i:nth-child(3) {
  height: 6px;
  animation-delay: 0.18s;
}

.live-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 42px 8px 30px;
  text-align: center;
}

.caption-orbit {
  position: relative;
  width: 112px;
  height: 82px;
  margin-bottom: 25px;
  border-radius: 28px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.018));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(255, 255, 255, 0.035),
    0 24px 70px rgba(0, 0, 0, 0.42);
  animation: orbitIn 0.72s 0.08s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.orbit-frame {
  position: absolute;
  inset: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
}

.orbit-line {
  position: absolute;
  left: 29px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  transform-origin: left center;
  animation: orbitText 2.5s ease-in-out infinite;
}

.orbit-line-one {
  top: 32px;
  width: 54px;
}

.orbit-line-two {
  top: 46px;
  width: 38px;
  opacity: 0.42;
  animation-delay: 0.18s;
}

.orbit-cursor {
  position: absolute;
  top: 29px;
  left: 27px;
  width: 2px;
  height: 22px;
  border-radius: 2px;
  background: #ffffff;
  box-shadow: 0 0 12px rgba(255, 255, 255, 0.34);
  animation: orbitCursor 2.5s ease-in-out infinite;
}

.live-kicker {
  margin: 0 0 9px;
  color: rgba(255, 255, 255, 0.36);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.2em;
  animation: copyIn 0.55s 0.17s ease both;
}

.live-hero h1 {
  margin: 0;
  color: #ffffff;
  font-size: clamp(36px, 10.5vw, 52px);
  line-height: 0.98;
  font-weight: 820;
  letter-spacing: -0.07em;
  animation: copyIn 0.62s 0.21s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.live-copy {
  max-width: 300px;
  margin: 13px 0 0;
  color: rgba(255, 255, 255, 0.47);
  font-size: 13px;
  line-height: 1.5;
  font-weight: 510;
  letter-spacing: -0.012em;
  animation: copyIn 0.62s 0.27s ease both;
}

.video-picker-state,
.video-ready-state {
  animation: panelIn 0.68s 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.video-picker {
  position: relative;
  width: 100%;
  min-height: 88px;
  padding: 14px;
  display: grid;
  grid-template-columns: 48px 1fr 30px;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  border-radius: 22px;
  color: #ffffff;
  text-align: left;
  background: var(--card);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.105),
    inset 0 -1px 0 rgba(255, 255, 255, 0.05),
    inset 0 0 22px rgba(255, 255, 255, 0.025),
    0 18px 46px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(14px) saturate(1.08);
  -webkit-backdrop-filter: blur(14px) saturate(1.08);
  transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.2, 1), background 0.22s ease;
}

.video-picker::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 20%, rgba(255, 255, 255, 0.055) 48%, transparent 76%);
  transform: translateX(-110%);
  animation: pickerSheen 4.8s 1.1s ease-in-out infinite;
  pointer-events: none;
}

.video-picker:active {
  transform: scale(0.985);
  background: rgba(255, 255, 255, 0.085);
}

.video-picker-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 17px;
  background: rgba(255, 255, 255, 0.075);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.video-picker-icon svg {
  width: 24px;
  height: 24px;
}

.video-picker-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.video-picker-copy strong {
  font-size: 14px;
  font-weight: 740;
  letter-spacing: -0.025em;
}

.video-picker-copy small {
  color: rgba(255, 255, 255, 0.34);
  font-size: 8.5px;
  font-weight: 760;
  letter-spacing: 0.12em;
}

.video-picker-arrow {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.42);
}

.video-picker-arrow svg {
  width: 17px;
  height: 17px;
}

.live-feature-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.live-feature {
  min-width: 0;
  height: 58px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.035);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.065);
}

.feature-icon {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  font-weight: 800;
}

.caption-feature-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.caption-feature-icon i {
  display: block;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
}

.caption-feature-icon i:first-child {
  width: 15px;
}

.caption-feature-icon i:last-child {
  width: 10px;
}

.live-feature > span:last-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.live-feature small,
.video-ready-head span {
  color: rgba(255, 255, 255, 0.3);
  font-size: 7.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.live-feature strong {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.82);
  font-size: 11px;
  font-weight: 680;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.video-ready-state {
  display: none;
}

.video-ready-state.show {
  display: block;
}

.video-ready-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin: 0 2px 10px;
}

.video-ready-head > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.video-ready-head strong {
  max-width: min(72vw, 390px);
  overflow: hidden;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.video-ready-head button {
  height: 32px;
  padding: 0 11px;
  border-radius: 11px;
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.075);
  font-size: 10px;
  font-weight: 700;
  transition: transform 0.2s ease, background 0.2s ease;
}

.video-ready-head button:active {
  transform: scale(0.92);
  background: rgba(255, 255, 255, 0.11);
}

.video-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 24px;
  background: #080808;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.08),
    0 24px 64px rgba(0, 0, 0, 0.42);
}

.video-stage video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #050505;
}

.caption-preview {
  position: absolute;
  left: 50%;
  bottom: 42px;
  max-width: 86%;
  transform: translateX(-50%);
  pointer-events: none;
}

.caption-preview span {
  display: block;
  padding: 7px 10px;
  border-radius: 9px;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(0, 0, 0, 0.68);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.35;
  white-space: nowrap;
}

.video-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  padding: 0 3px;
  color: rgba(255, 255, 255, 0.35);
  font-size: 9px;
  font-weight: 650;
}

.ready-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: rgba(255, 255, 255, 0.58);
}

.ready-chip i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 0 9px rgba(255, 255, 255, 0.38);
}

.start-captions {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 15px;
  background: #ffffff;
  color: #050505;
  box-shadow: 0 14px 36px rgba(255, 255, 255, 0.08);
  font-size: 13px;
  font-weight: 790;
}

.start-captions small {
  color: rgba(0, 0, 0, 0.42);
  font-size: 8px;
  font-weight: 700;
}

.start-captions:disabled {
  opacity: 0.48;
}

.live-footer {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  margin-top: 24px;
  padding: 0 4px;
  animation: panelIn 0.7s 0.42s ease both;
}

.live-footer small {
  color: rgba(255, 255, 255, 0.24);
  font-size: 8px;
  font-weight: 680;
  letter-spacing: 0.035em;
}

.footer-line {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08));
}

.footer-line:last-child {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.08), transparent);
}

.live-toast {
  position: fixed;
  z-index: 100;
  left: 50%;
  bottom: calc(18px + env(safe-area-inset-bottom));
  max-width: calc(100vw - 32px);
  padding: 9px 12px;
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(15, 15, 15, 0.9);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.09),
    0 16px 50px rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  font-size: 11px;
  font-weight: 620;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 8px) scale(0.96);
  transition: opacity 0.2s ease, transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.live-toast.show {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}

.live-lock {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #000000;
}

.live-lock-card {
  width: min(280px, 82vw);
  text-align: center;
}

.live-lock-title {
  margin: 0 0 15px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 12px;
  font-weight: 720;
  letter-spacing: 0.02em;
}

.live-lock-bar {
  position: relative;
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.live-lock-bar span {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.78);
  transition: width 0.4s linear;
}

.live-lock.indefinite .live-lock-bar span {
  width: 34%;
  animation: lockIndeterminate 1.4s ease-in-out infinite;
}

@keyframes headerIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes markPulse {
  0%,
  100% {
    transform: scaleY(0.65);
    opacity: 0.45;
  }
  50% {
    transform: scaleY(1.15);
    opacity: 1;
  }
}

@keyframes orbitIn {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.86);
    filter: blur(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

@keyframes orbitText {
  0%,
  18% {
    transform: scaleX(0.08);
    opacity: 0.3;
  }
  48%,
  76% {
    transform: scaleX(1);
    opacity: 0.9;
  }
  100% {
    transform: scaleX(0.24);
    opacity: 0.34;
  }
}

@keyframes orbitCursor {
  0%,
  18% {
    transform: translateX(0);
    opacity: 1;
  }
  55%,
  76% {
    transform: translateX(57px);
    opacity: 1;
  }
  100% {
    transform: translateX(15px);
    opacity: 0.3;
  }
}

@keyframes copyIn {
  from {
    opacity: 0;
    transform: translateY(10px);
    filter: blur(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}

@keyframes panelIn {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.975);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes pickerSheen {
  0%,
  70% {
    transform: translateX(-110%);
  }
  86%,
  100% {
    transform: translateX(115%);
  }
}

@keyframes lockIndeterminate {
  0% {
    transform: translateX(-120%);
  }
  55%,
  100% {
    transform: translateX(185%);
  }
}

@media (max-width: 380px) {
  .live-hero {
    padding-top: 32px;
  }

  .caption-orbit {
    width: 102px;
    height: 76px;
    margin-bottom: 21px;
  }

  .live-feature {
    padding-left: 10px;
    padding-right: 10px;
  }

  .feature-icon {
    width: 29px;
    height: 29px;
    flex-basis: 29px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
}
`;

export const VEXA_LIVE_INTEGRATION_CSS = `
.vexa-live-open-button {
  position: relative;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  padding: 0;
  border: 0;
  border-radius: 13px;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: #ffffff;
  text-decoration: none;
  background: rgba(13, 13, 13, 0.62);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.105),
    inset 0 -1px 0 rgba(255, 255, 255, 0.06),
    inset 0 0 18px rgba(255, 255, 255, 0.05),
    0 10px 22px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(10px) saturate(1.12);
  -webkit-backdrop-filter: blur(10px) saturate(1.12);
  transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.2, 1), background 0.2s ease;
}

.vexa-live-open-button::after {
  content: "";
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 5px;
  height: 1px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.72), transparent);
  opacity: 0.45;
  transform: translateX(-15%);
  animation: vexaLiveButtonScan 2.8s ease-in-out infinite;
}

.vexa-live-open-button:active {
  transform: scale(0.88);
  background: rgba(255, 255, 255, 0.105);
}

.vexa-live-open-button svg {
  width: 18px;
  height: 18px;
}

@keyframes vexaLiveButtonScan {
  0%,
  100% {
    transform: translateX(-18%) scaleX(0.6);
    opacity: 0.25;
  }
  50% {
    transform: translateX(18%) scaleX(1);
    opacity: 0.72;
  }
}

@media (max-width: 380px) {
  .vexa-live-open-button {
    width: 34px;
    flex-basis: 34px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .vexa-live-open-button::after {
    animation: none;
  }
}
`;
