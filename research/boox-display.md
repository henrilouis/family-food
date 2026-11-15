# How should a Boox Go 7 show a kitchen page?

Research for [#3](https://github.com/henrilouis/food-automation/issues/3). Researched November 2026. Vocabulary follows `GLOSSARY.md`; "Kitchen Display" is the Boox Go 7 in the kitchen.

## Answer

Run the Kitchen Display as a **plain web page shown full-screen in Fully Kiosk Browser**. Set the Boox to **never sleep** and keep it **plugged in, with battery protection on**. The page is a small, static-first, black-on-white HTML page served on the LAN (the Pi's job). It **checks a tiny version file every few minutes and reloads only when the Week Menu changed**. Taps ("cooked", 👍/👎) are ordinary `fetch()` POSTs to the same server.

- **Obsidian on Android** is a credible plan B. It needs no server, and taps would edit vault notes directly. But it is a poor fit for a kiosk: dense UI, no auto-start or auto-reload, kids can edit notes, and it needs Obsidian Sync or Syncthing-Fork to get the vault onto the device.
- **The Boox's own browsers (NeoBrowser, Chrome)** work for trying things out. They lack auto-start on boot, a locked full-screen mode and reload control. A full-screen installed web app (PWA) would fix some of that, but it needs HTTPS, which is awkward on a home LAN.
- **A custom native Android app** (added in the follow-up) is not worth it for v1. See [Native Android app](#native-android-app). The parts that would justify it are unreliable on BOOX:
  - Kiosk lock-down needs device owner, which BOOX appears to block.
  - The app cannot keep the screen on by itself; the BOOX setting still decides.
  - The BOOX e-ink SDK is described as unstable by the developers who use it.

  It would also lock the eventual family planning app to Android. If v1 outgrows Fully, the next step is a **thin native WebView shell around the same web page**, not a rewrite.
- **Hands-free control** (added in the follow-up): **don't build voice for v1**. Show one recipe step per screen and let the Go 7's physical page-turn buttons, pressed with a knuckle, move between steps. The buttons send PageUp/PageDown, which a web page receives as ordinary key presses. A Bluetooth page-turn pedal or remote (it pairs as a keyboard) is the next-cheapest upgrade. Voice does favour a native shell: Fully's WebView has no working Web Speech API. Offline Dutch commands are feasible with Vosk, but that is a v2 project. See [Hands-free control](#hands-free-control).

## The device (facts)

| Property | Value | Source |
| --- | --- | --- |
| Screen | 7" monochrome Carta 1300, 1680 × 1264, 300 ppi, capacitive touch | [BOOX Go 7 product page][go7] |
| OS | Android 13, Google Play built in, 3rd-party apps supported | [BOOX Go 7 product page][go7] |
| SoC / memory | Octa-core, 4 GB RAM, 64 GB storage | [BOOX Go 7 product page][go7] |
| Buttons | Power button, physical page-turn buttons | [BOOX Go 7 product page][go7] |
| Audio | Built-in microphone and speaker; no camera in the spec list | [BOOX Go 7 product page][go7] |
| Battery | 2,300 mAh; USB-C | [BOOX Go 7 product page][go7] |
| Front light | Adjustable warm/cold (can be off) | [BOOX Go 7 product page][go7] |
| Water | "Water-repellent … splashes", explicitly *not* waterproof | [BOOX Go 7 product page][go7] (footnote 3) |
| Firmware | V4.1 rolled out to Go 7 in Aug 2025 (EinkWise replaces "E Ink Center") | [BOOX V4.1 blog][fw41], [r/Onyx_Boox announcement][fw41-go7] |
| WebView | Updatable Android System WebView; a Go 7 owner reported v137 (Oct 2025) | [readest#827 comment][webview-go7], [Chrome WebView docs][webview-docs] |

What follows: the page renders in a modern Chromium WebView, so ordinary modern HTML, CSS and JS work. The limits come from the e-ink panel, not the browser engine. In BOOX's help center the Go 7 falls under the "E Ink Tablets" guide, not the "ePaper Tablet PCs" (Tab series) guide, so its power settings are under **Settings › Power** ([Sleep and Battery, E Ink Tablets][sleep]).

## Options compared

| | Fully Kiosk Browser | NeoBrowser / Chrome | Obsidian Android |
| --- | --- | --- | --- |
| Full-screen, no system bars | Yes ("real fullscreen mode (immersive sticky)") [^fk-all] | NeoBrowser has a "Full-Screen Mode" [^neo]; Chrome only via an installed PWA (HTTPS needed) [^pwa] | App chrome always visible |
| Auto-start on boot | Yes [^fk-all] | No | No |
| Auto-reload controls | Reload on idle, on page error, on screen-on, on network reconnect [^fk-reload] | Manual, or page JS | Re-renders a note when its file changes (only while the app is in the foreground) |
| Lock out kids / accidental exit | Kiosk Mode with PIN (PLUS) [^fk-all] | No | No; notes are editable |
| Remote "load this URL now" | REST API `loadUrl` (PLUS, needs Remote Admin) [^fk-rest] | No | No |
| Needs a LAN server | Yes | Yes | No (needs vault sync instead) |
| Write-back of taps | `fetch()` POST to the server | Same | Edit a checkbox or property in the note, then sync |
| Cost | Free; PLUS €8.90 one-time per device; all PLUS features free to try, with a watermark [^fk-lic] | Free | Free app; Obsidian Sync $4–5/month [^obs-price], or free Syncthing-Fork [^st] |

### Adding a native app, a WebView shell and a PWA

Columns: **Fully** is Fully Kiosk + web page (recommended). **Native** is a native Kotlin/Compose app. **Shell** is a thin native WebView shell around the same web page. **PWA** is the page installed from Chrome.

| | Fully | Native | Shell | PWA |
| --- | --- | --- | --- | --- |
| Effort for v1 | Lowest: one HTML page + Fully settings | Highest: Android Studio/Gradle project, Compose UI, sideloading | Medium: ~1 small Kotlin activity + the same web page | Low code, but needs HTTPS on the Pi + Chrome |
| Screen stays on | BOOX Auto Sleep → Never (Fully's flag as a bonus) | Same: `FLAG_KEEP_SCREEN_ON` is documented, but BOOX has overridden it; still needs Auto Sleep → Never [^keepon] [^mobilesheets] | Same as native | Same as Fully, without the extra flag |
| Kiosk lock | Fully Kiosk Mode (PLUS) | Lock task needs device owner via `adb dpm set-device-owner`, reported blocked on BOOX; fallbacks are screen pinning (exitable) or default-home app (BOOX sometimes reverts) [^locktask] [^dpm-boox] [^launcher-go7] | Same as native | None |
| Auto-start on boot | Built in | Home-app role or `BOOT_COMPLETED` receiver | Same as native | No |
| E-ink refresh control | BOOX per-app settings only | BOOX per-app settings + Onyx SDK (`EpdController` / `EpdDeviceManager`): partial vs full (GC) refresh per view [^onyx-epd] | Same, plus `setWebViewContrastOptimize` for WebViews [^onyx-epdc] | BOOX per-app settings (for Chrome) |
| Offline (Pi or Wi-Fi away) | Page stays in memory; taps can queue in `localStorage`. No service worker on plain HTTP, so a reboot while the Pi is down shows an error page | Full control: cache the week on device, queue taps, retry | Can bundle the page and cache data natively | Service worker cache + queue (works because it is HTTPS) [^sw] |
| Page-turn buttons | PageUp/PageDown `keydown` in the page ("Page turning" mode) | `onKeyDown`, any mode incl. volume keys | Both | `keydown` only |
| Voice | No Web Speech API in WebView; mic needs HTTPS + PLUS | `SpeechRecognizer` or on-device Vosk | Native bridge exposes speech to the page | Chrome's Web Speech API (server-based by default) |
| Updating | Edit HTML on the Pi; no device visit | Rebuild APK; `adb install -r` over Wi-Fi, or self-update with user confirmation | Web changes from the Pi; APK changes rarely | Edit on the Pi |
| Stepping stone to a full planning app | Good: the same web app runs on phones and laptops | Poor: Android/BOOX-only | Good: web app stays the product, shell stays thin | Good |

See [Native Android app](#native-android-app), [PWA and wrappers](#pwa-and-wrappers) and [Hands-free control](#hands-free-control) for the evidence.

### Why not Obsidian as the primary route

- The vault has to live on the device. The official Syncthing Android app was discontinued in December 2024 ([Syncthing forum][st-disc], [syncthing-android README][st-readme]). The maintained option is **Syncthing-Fork** ([Play Store listing][st-fork]). The paid alternative is **Obsidian Sync** ([pricing][obs-price]).
- BOOX freezes background apps to save power ([App Management Settings › App Freeze][appmgmt]). So sync only runs reliably while Obsidian is in the foreground.
- Obsidian on a Boox works fine for reading. Users recommend a light, high-contrast theme and few plugins ([r/ObsidianMD thread][obs-reddit], [lebaux.co][obs-lebaux]). But it is an editor, not a glanceable kitchen board, and a child's tap can change a note.
- **Keep in mind**: it is the only route with no Pi and with write-back for free. Tapping a `- [ ] cooked` checkbox in reading view edits the Recipe note itself. If the Pi turns out to be a burden, this is the fallback.

## Native Android app

What a custom Kotlin app (Jetpack Compose or Views) would and would not buy on the Go 7.

**E-ink control via the Onyx SDK**

- BOOX publishes `onyxsdk-device`, `onyxsdk-base` and `onyxsdk-pen` on its own Maven repo. `onyxsdk-device` 1.3.7 is the latest listed as of November 2026 ([repo metadata][onyx-maven]).
- The demo repo was updated in September 2026, including an arm64 ABI fix ([OnyxAndroidDemo][onyx-demo]). Its README still shows a stale 1.1.11 dependency.
- `EpdController` sets per-view update modes and forces a full refresh with `EpdController.invalidate(view, UpdateMode.GC)` ([EPD-Screen-Update.md][onyx-epd-doc]):
  - GU: 16-level partial update.
  - REGAL: optimised partial update for text.
  - GC: full-screen refresh.
  - DU/ANIMATION: fast black-and-white.
- `EpdDeviceManager` adds "GC every N partial updates", and there is an app-wide `Device.currentDevice().setAppScopeRefreshMode(UpdateOption.REGAL …)` ([EpdController.md][onyx-epdc-doc], [EPD-Update-Mode.md][onyx-mode-doc]). For a WebView there is `setWebViewContrastOptimize(view, enabled)` ([EpdController.md][onyx-epdc-doc]).
- **Reliability is the catch.**
  - The maintained open-source BOOX app Notable (Kotlin/Compose, targetSdk 35) wraps every `setViewDefaultUpdateMode` call in try/catch "because the Onyx library is unstable and unreliable" ([Notable commit][notable-commit]).
  - Notable also needs a hidden-API bypass library so the SDK can reach hidden Android APIs ([Notable build.gradle][notable-gradle]).
  - The OnyxTweaks author reported the SDK "can't switch modes correctly anymore" on the 4.1 beta firmware ([OnyxTweaks releases][onyxtweaks]).
  - Open SDK issues include "Can't clear residual artifacts using EpdController" and "Can't prevent automatic screen updates" in a WebView ([#78][onyx-78], [#89][onyx-89]).
  - The licence of the SDK binaries is unclear; only the demo repo got an Apache-2.0 LICENSE, in Sep 2026 ([#120][onyx-120]).
- **Conclusion:** the SDK can add "full refresh after each recipe step" on top of what the BOOX per-app settings already give. That is nice to have, not decisive. Treat every call as best-effort.

**Keeping the screen on**

- Android's kiosk guidance is to set `FLAG_KEEP_SCREEN_ON` on the activity ([Android: keep the screen on][android-screen-on], [dedicated-devices cookbook][android-cookbook]).
- On BOOX this has been overridden by firmware sleep. The MobileSheets developer found neither the flag nor a CPU wake lock prevented sleep, and only the system Auto Sleep → Never did ([MobileSheets forum][mobilesheets]).
- A **foreground service does not help**. It keeps a process alive, not the screen. The flag "may only be set in an activity, never in a service" ([Android: keep the screen on][android-screen-on]).
- A device owner could set `Settings.Global.STAY_ON_WHILE_PLUGGED_IN` ([DevicePolicyManager][android-dpm]). That runs into the device-owner problem below.
- **Conclusion:** a native app still needs BOOX Auto Sleep → Never, exactly like Fully. No gain.

**Kiosk without Fully**

- Real lock-down is Android **lock task mode**. It requires the app to be allowlisted by a device owner (`setLockTaskPackages`). Without that, `startLockTask()` only gives **screen pinning**, which the user can exit ([lock task mode][android-locktask]).
- Device owner can be set over adb with `dpm set-device-owner`, but only when **no accounts are on the device**. The Google account and possibly the ONYX account would have to go ([dedicated-devices cookbook][android-cookbook]).
- A BOOX user reported that `dpm set-device-owner` was blocked ("boox has put restrictions to change the device owner") and expected to need root ([r/Onyx_Boox, Feb 2025][dpm-boox]). The same kiosk question to Onyx's SDK repo has had no answer since 2022 ([OnyxAndroidDemo #77][onyx-77]).
- The fallback is making the app the **default home app**, so Home and reboot return to it. Go 7 owners report this works only after unfreezing the app in BOOX settings. Others report BOOX reverting to its own launcher after a reboot or when a BOOX app opens ([r/Onyx_Boox: launcher on Go 7][launcher-go7], [changing launchers][launcher-revert]).
- **Conclusion:** a native app does not reliably get a better kiosk than Fully's (paid) Kiosk Mode. Both sit on the same BOOX constraints. Fully has already solved them on thousands of devices.

**Offline**

- This is the native app's real strength. It can store the current Week Menu and recipes on the device and queue "cooked"/👍/👎 taps, retrying when the Pi is reachable. That matters because the Pi is the only always-on server and the Mac is a sleeping work laptop.
- The web route can get most of this without native code:
  - The loaded page stays in memory.
  - The version poll should only reload after a successful fetch.
  - Taps can queue in `localStorage`.
- The gap is a **reboot while the Pi is down**. A service worker would cover that, but service workers require a secure context, so HTTPS ([MDN: Service Worker API][sw-mdn]).

**Page-turn buttons**

- BOOX lets each app's side buttons act as **Page turning**, **Volume** or **Scrolling** (App Optimization › Others › Custom side buttons) ([App Optimization][appopt]; walkthrough for the Go 7 in [kvibber.com][kvibber]).
- A Go 7 owner reports "Page turning" sends **PgDn/PgUp** ([capyreader discussion][capy]). A web page receives those as normal `keydown` events, so no native code is needed.
- A native app can also take the **Volume** mode in `onKeyDown`. Inside Fully, volume keys only reach the page via the PLUS JavaScript interface (`fully.bind('volumeUp' …)`) ([Fully JavaScript Interface][fk-js]).

**Build, distribution and maintenance for one family device**

- **Native Kotlin/Compose:** Android Studio + Gradle on the Mac, sideload the APK (enable USB debugging under [App Management Settings][appmgmt]), update via `adb install -r` (wireless debugging works on Android 13). No Play Store, so no targetSdk treadmill, but Gradle/AGP and the Onyx SDK's dependency quirks still need upkeep ([OnyxAndroidDemo issues][onyx-issues]). Every UI change is an APK rebuild and a device visit.
- **Thin WebView shell:** one activity hosting a WebView pointed at the Pi. It adds only what the web cannot do: keep-screen-on flag, home-app role, key capture, a JS bridge for speech, an optional Onyx GC refresh, and a bundled offline fallback page. The UI stays a web page served by the Pi, so most changes need no new APK. This is the least-regret native option.
- **Capacitor:** a heavier toolchain (Node + Gradle) for the same WebView result. Worth it only with several native plugins.
- **Trusted Web Activity:** renders inside Chrome and needs Digital Asset Links over HTTPS. It inherits Chrome's BOOX settings and the HTTPS problem, so it gains nothing over a PWA.

**Fit with the long-term goal**

- The family eventually wants a full planning app: Recipe Vault browsing, Week Menu editing, Basket review.
- That app wants to run on phones and laptops too, so a **web app is the better stepping stone**: the Kitchen Display page becomes one view of it.
- A native Compose app would be Android- and BOOX-specific code that the full app cannot reuse.
- If native capabilities are ever needed, the WebView shell keeps the web app as the product.

## PWA and wrappers

- **PWA.** Chrome installs a PWA (a full-screen app with its own icon and service-worker offline cache) only over **HTTPS**, with a manifest and icons ([web.dev install criteria][pwa]). NeoBrowser documents no install feature ([NeoBrowser][neo]), so this means installing Chrome. On the LAN, HTTPS means a real certificate (for example a Let's Encrypt DNS challenge for a home subdomain) or a self-signed CA trusted on the Boox.
  - Gains: an offline cache that survives reboots, and the HTTPS that also unlocks the microphone for web voice.
  - Still missing: auto-start, kiosk lock and reload control. That is why it stays behind Fully for v1.
- **Wrappers** are covered in the build section above. The **thin WebView shell** is the one worth keeping in mind. TWA and Capacitor add cost without solving a v1 problem.

## Hands-free control

Hands get greasy, so how can someone move to the next step without wiping their hands first?

**Microphone and speech services on the Go 7**

- The Go 7 has a **built-in microphone** and **Google Play built in** ([product page][go7]). BOOX says "most BOOX models are equipped with a built-in microphone" and its keyboard has speech-to-text ([BOOX blog: input speed][boox-stt]). Users report that keyboard's voice input only covers Chinese, Japanese and English, and that Gboard voice typing works on BOOX ([r/Onyx_Boox: Google keyboard][gboard-boox]). So **Dutch voice typing needs Gboard**.
- Android's `SpeechRecognizer` needs a recognition service on the device. Usually that is the Google app; test `isRecognitionAvailable()` and `isOnDeviceRecognitionAvailable()` on the Go 7.
  - Android says the default implementation "is likely to stream audio to remote servers" and "is not intended to be used for continuous recognition" ([SpeechRecognizer][android-sr]).
  - On-device recognition (`createOnDeviceSpeechRecognizer`, API 31+) depends on Google's offline language packs being available for the device. Unverified on BOOX.

**Web route (Fully, PWA)**

- **Android WebView does not provide a working Web Speech API.** Browser apps built on WebView polyfill it by bridging to native `SpeechRecognizer` ([AABrowser PR citing Chromium issue 40417848][aabrowser]; [Stack Overflow][so-webview-speech]). That rules it out in **Fully**, whose JavaScript interface offers text-to-speech but no speech recognition ([Fully JavaScript Interface][fk-js]).
- Chrome itself (so a PWA) has `SpeechRecognition`. It is server-based by default; on-device recognition via `processLocally` needs Chrome 139+ and a downloaded language pack ([MDN: Using the Web Speech API][mdn-speech]).
- The other web route is raw mic audio via `getUserMedia` plus an in-page recognizer. That needs a **secure context** (HTTPS) ([MDN getUserMedia][gum]), and in Fully it needs PLUS ("Access microphone by website", [features][fk-all]).
- Fully's "acoustic motion detection" (PLUS) only wakes the screen on sound; it does not recognise words ([features][fk-all]).

**Obsidian**

- Only Gboard dictation into a note. No commands. Not useful here.

**Native app or shell: offline command recognition**

- **Vosk** is offline and Apache-2.0 licensed, with Android bindings.
  - Small Dutch model `vosk-model-small-nl-0.22`: 39 MB. Small English model: 40 MB ([Vosk models][vosk-models]).
  - The vocabulary can be restricted at runtime to a word list ([Vosk adaptation][vosk-adapt]). That suits a tiny command set: "volgende", "vorige", "terug", "next", "back", "timer tien minuten".
  - This is the best fit.
- **Porcupine/Rhino (Picovoice):** a wake word plus speech-to-intent engine. Its language list has no Dutch ([Porcupine docs][porcupine]). Picovoice states it has "no dedicated free or paid plans for personal or non-commercial use" ([Picovoice FAQ][pv-faq]). Out.
- **openWakeWord:** open source, but "only English models" are pre-trained; custom words are trained from synthetic speech. The reference implementation is Python with ONNX/TFLite, so an Android port would be DIY ([openWakeWord README][oww]). Possible for a custom Dutch wake word, but real effort.

**Cost and privacy**

- The device is plugged in, so battery is not the issue; heat and CPU are. Continuous recognition keeps a core busy.
- Gate the recognizer behind voice activity detection, or better, use **push-to-talk**: a page-turn button press opens a 5-second listening window.
- An always-listening mic in a family kitchen with two young children is a household decision. Offline Vosk keeps audio on the device; the Google `SpeechRecognizer` probably streams it to Google.
- Push-to-talk avoids always-on listening entirely.

**Non-voice alternatives**

1. **One step per screen.** Design the recipe view so each screen is a whole step (or the whole recipe for short ones). Then nothing needs touching while a step is in progress. Whether every Recipe fits is for #12. At 7" and counter-readable type, most methods will need two or more screens.
2. **The Go 7's page-turn buttons**, pressed with a knuckle or the back of a finger. In "Page turning" mode they arrive as PageUp/PageDown `keydown` events ([capyreader discussion][capy]). Zero cost, zero native code.
3. **A Bluetooth page-turn pedal or remote.** These pair as a keyboard (HID) and send arrow keys or PageUp/PageDown depending on mode ([AirTurn PED manual][airturn], [PageFlip Dragonfly][pageflip]). The web page handles them like the buttons. A foot pedal is truly hands-free; a cheap clicker can sit on the counter for an elbow press. Bluetooth stays on, which is fine on mains power. Check the remote's mode: some send volume or media keys.

**Conclusion**

- Voice does tip the balance toward native code, but only toward a **thin shell with a speech bridge**, not a native app. No web option on the Go 7 gives a working offline Dutch recognizer without HTTPS plus Fully PLUS plus a WebAssembly model.
- Voice is not needed for v1. The **cheapest adequate hands-free option is the built-in page-turn buttons plus one step per screen**, with a Bluetooth pedal as an optional upgrade. All of it works in the recommended Fully setup with a `keydown` handler.
- Revisit voice once the display is in daily use and the family still wants it. Commands beyond next/previous (timers, quantities) are where voice would earn its keep.

## Keeping the screen on

- **Set Settings › Power › Auto Sleep → Never.** BOOX documents Auto Sleep and Auto Shutdown under Settings › Power on E Ink Tablets ([Sleep and Battery][sleep]). Users confirm a "Never" option: "Power > Auto Sleep > Never" ([r/Onyx_Boox, Mar 2025][never-reddit]); Auto Sleep offers up to 1 h or "Never Sleep" ([r/Onyx_Boox, Aug 2024][autosleep-reddit]).
- **Also set Auto Shutdown (power-off timeout) → Never** ([the-ebook-reader tips][ebr-tips]). Otherwise the device powers off after inactivity.
- **Don't rely on the app's "keep screen on" alone.** The MobileSheets developer found that BOOX firmware put a Tab X to sleep even while the app held Android's `FLAG_KEEP_SCREEN_ON` and simulated taps. The system Auto Sleep → Never setting fixed it ([MobileSheets forum][mobilesheets]). Turn on Fully's "Keep screen on" too, but treat the BOOX setting as the one that matters.
- **Why sleep is fatal for a live page.** In sleep, BOOX shows a screensaver and drops Wi-Fi ("Delay disconnection after into Sleep mode", recommended: Immediately) ([Sleep and Battery, Tab series][sleep-tab]). Fully's docs add that "the Android Webview will pause scripting when the screen is off", so a page cannot keep itself alive ([Fully Power Settings][fk-power]).
- **Disable App Freeze for Fully** and enable "Stay active in the background" in its App Optimization ([App Optimization › Others][appopt], [App Management Settings][appmgmt]). Also enable Fully's "Autostart on boot" ([Fully features][fk-all]).
- The "Transparent" screensaver keeps the current screen visible while the device sleeps ([Desktop and Screensavers][screensaver]). That gives a frozen page at near-zero power, but with no Wi-Fi and no updates. It could serve as a night mode, not as the main mode.

## Power

- **Keep it plugged in permanently.** BOOX's 3–5-week battery claim is for **sleep mode**; "third-party apps, front lights or WiFi / Bluetooth connection may consume more power than usual" ([Sleep and Battery][sleep]). An awake Android device with Wi-Fi on and Auto Sleep set to Never will drain 2,300 mAh within days, not weeks. (That is an inference; I found no first-party always-on figure for the Go 7.)
- **Turn on Settings › Power › Protect battery.** It caps charging at 80%. Users report it on firmware 4.1.1 ([r/Onyx_Boox, Mar 2026][protect-reddit]) and on the Go 6/Go 7 ("Battery Protection" under Power Management, [yutty, Sep 2026][yutty]). Verify it on the device. Swollen batteries are the classic failure of always-plugged wall tablets ([HA community][ha-swell], [r/homeassistant][ha-spicy]).
- Keep the **front light off** in daytime: e-ink is reflective, so a lit kitchen is enough.
- If Protect battery is missing or flaky, the usual fallback is a smart plug that cycles the charger between roughly 20% and 80% ([r/Onyx_Boox][wallmount-reddit], [HA community][ha-power]).

## E-ink refresh, ghosting and page design

**Refresh modes.** EinkWise (Control Center › EinkWise) sets the mode **per app** ([Refresh Modes][refresh], [EinkWise][einkwise]):

- HD Mode (system default): "crispest texts with the least ghosting", for static content.
- Speed Mode: fastest, for scrolling and web browsing.
- Regal Mode (third-party apps): reduces ghosting, at the cost of slightly more flicker.

**Recommendation:** set Fully to **HD**, or Regal if ghosting builds up. The page is static nearly all the time, and a page change is one deliberate redraw.

**Clearing ghosting.**

- Settings › System Display › **Full-refresh Frequency** forces a full refresh every N taps ([Display Settings][display]).
- The per-app App Optimization option **"Automatic full-refresh when switching pages"** ([App Optimization][appopt]).
- A manual Full Refresh from the Control Center ([Refresh Modes][refresh]).
- A once-a-night reload at a quiet hour helps too ([e-ink dashboard guide, bigiron.cc][bigiron]; secondary source).

**Page design.** BOOX's own e-ink developer guide ([onyx-intl/OnyxAndroidDemo][onyx-guide]) says:

1. Use black and white (16-level greyscale) as the main colours.
2. No transparent layers over text or images.
3. Load more content a page at a time; don't scroll.
4. Avoid animation, scrolling and dragging.
5. Font size of at least 14sp; prefer bold for embedded fonts.
6. Buttons at least 36 × 36 dp in the centre of the screen, 48 × 48 dp at the edges.

From the web side:

- No CSS transitions, animations or spinners. CSS has an `update: slow` media feature meant for e-book readers ([MDN `update`][mdn-update]), but don't count on the WebView reporting it. Just ship no motion.
- Pure `#000` on `#fff`. Use greys only for large areas and never to encode meaning, because mid-greys merge on a reflective panel. Separators should be solid borders ([epaper-components.dev][epaper-design]; [iviv.hu][iviv]; secondary).
- Light theme only; dark themes ghost and render badly on e-ink ([r/ObsidianMD][obs-reddit]; [iviv.hu][iviv]).
- **Paginate, don't scroll.** For a long recipe, use "next/previous step" pages. The Go 7's **physical page-turn buttons** can be remapped per app to page-turn, volume or scroll keys ([App Optimization › Custom side buttons][appopt]). The page can listen for `keydown`. Test on the device which key codes actually reach the WebView.
- Fonts: system sans or a self-hosted bold-ish web font. BOOX App Optimization can also force **bold fonts**, **text strokes** and **anti-aliasing** per app ([App Optimization][appopt]). Size for reading from the counter, well above the 14sp minimum (to be settled in #12).
- Big tap targets with **instant visual state** (invert the button on tap). Don't show a loading spinner; the panel's latency makes missed or double taps likely, so make write-back taps idempotent.
- Fixed regions that don't reflow, so an update redraws only a small area ([epaper-components.dev][epaper-design]; secondary).
- Viewport: 1680 × 1264 physical pixels at 300 ppi. The CSS viewport depends on the device pixel ratio and BOOX's per-app **DPI setting** ([App Optimization][appopt]). Measure `innerWidth` and `devicePixelRatio` on the device before fixing a layout.

## Refreshing the page when the Week Menu changes

Options, roughly simplest first:

1. **Poll a version file (recommended).** The page `fetch`es e.g. `/version.txt` (or an ETag) every 1–5 minutes and calls `location.reload()` only when it changed. This works in any browser, needs no paid features, and causes no redraws when nothing changed. That matters on e-ink, where every redraw risks a flash or ghosting. It only works while the device is awake, which "Auto Sleep → Never" guarantees.
2. **Fully "Auto Reload on Idle / on Network Reconnect / on Page Error"** as a safety net ([Web Auto Reload][fk-reload]). Use a long idle interval, or a blind periodic reload will flash the panel for nothing.
3. **Push from the Mac or Pi:** `GET http://<boox>:2323/?cmd=loadUrl&url=…` via Fully's REST API ([REST API][fk-rest]). Updates are instant, but it needs PLUS (€8.90) plus Remote Admin, and the Boox becomes a second server to keep reachable.
4. Server-Sent Events or WebSocket from the Pi. Possible, but more moving parts than polling, for a page that changes about once a week plus on taps.

## Gotchas

- **BOOX settings are per app and easy to lose.** Refresh mode, DPI, bold text, full-refresh-on-page-change, stay-active-in-background and freeze state all live per app ([App Management Settings][appmgmt]). Note them down; "Reset all app optimization" wipes them.
- **Firmware updates arrive in batches** and can move settings around ([the-ebook-reader on V4.1][ebr-41]). Settings › Power is where they live on firmware 4.x today.
- **Fully PLUS features run unlicensed with a watermark.** Everything can be tested before paying ([license page][fk-lic]). Kiosk Mode (PIN lock), the REST API and scheduled sleep/wake are PLUS features ([features][fk-all]). Without PLUS, a child can still swipe out of Fully.
- **Without Fully, Chrome's PWA "install" needs HTTPS** ([web.dev install criteria][pwa]). On a LAN Pi that means a certificate dance. One more reason to use Fully.
- **Water-repellent is not waterproof** ([product page][go7]). Mount it away from the sink and hob.
- **No first-party always-on power figures exist** for the Go 7. Measure drain in a test week before relying on Protect battery.

## Open questions for later tickets

- #12 (what it shows): exact CSS viewport, font size readable from the counter, and which key codes the page-turn buttons send inside Fully. All need the device in hand.
  - Design recipes as **one step per screen**, navigated by PageUp/PageDown, ArrowUp/ArrowDown and ArrowLeft/ArrowRight `keydown` events, so the side buttons and any Bluetooth pedal work without touching the screen.
  - Test whether a full refresh between steps is needed.
- #11 (architecture): the page only needs a LAN HTTP server that serves static HTML plus a version file and accepts tap POSTs. A Pi 3 is more than enough. Obsidian-on-Boox could remove the Pi entirely, at the cost of a worse kiosk experience.
  - Keep the Kitchen Display a **web view of a future web app**, not a separate native client.
  - Make tap write-back idempotent and queueable: the Pi may be unreachable, and the page should not reload unless the version check succeeded.
  - Decide whether the Pi serves **HTTPS**. It unlocks service-worker offline, PWA install and microphone access, so it is the gate for any later web-side voice. Without it, voice means a native shell.

## Sources

Primary (vendor docs and specs):

- [BOOX Go 7 product page and specs](https://shop.boox.com/products/go7)
- [Sleep and Battery, E Ink Tablets](https://help.boox.com/653d4/bf180/f6bee)
- [Sleep and Battery, ePaper Tablet PCs](https://help.boox.com/fa5fa/23ee5/2f5e5)
- [Display Settings](https://help.boox.com/653d4/bf180/d7e0b)
- [Desktop and Screensavers](https://help.boox.com/653d4/bf180/6e1b9)
- [Refresh Modes](https://help.boox.com/653d4/964c1/2b21d)
- [EinkWise](https://help.boox.com/653d4/964c1/a3f4a)
- [App Optimization](https://help.boox.com/653d4/914cc/dd66a)
- [App Management Settings](https://help.boox.com/653d4/914cc/c5927)
- [NeoBrowser](https://help.boox.com/653d4/914cc/5040c)
- [BOOX Firmware V4.1](https://shop.boox.com/blogs/news/boox-firmware-v4-1-overview-of-new-features-and-upgrades)
- [BOOX e-ink developer guide](https://github.com/onyx-intl/OnyxAndroidDemo/blob/master/doc/Eink-Develop-Guide.md)
- [Fully Kiosk, all features](https://www.fully-kiosk.com/docs/en/features/all)
- [Fully, Web Auto Reload](https://www.fully-kiosk.com/docs/en/configuration/web-auto-reload)
- [Fully, Power Settings](https://www.fully-kiosk.com/docs/en/configuration/power)
- [Fully, REST API](https://www.fully-kiosk.com/docs/en/api/rest)
- [Fully PLUS license, €8.90 per device](https://www.fully-kiosk.com/docs/en/legal/fully-plus-license)
- [Obsidian Sync pricing](https://obsidian.md/pricing)
- [syncthing-android discontinued](https://github.com/syncthing/syncthing-android/blob/main/README.md)
- [Syncthing forum announcement](https://forum.syncthing.net/t/discontinuing-syncthing-android/23002)
- [Syncthing-Fork](https://play.google.com/store/apps/details?id=com.github.catfriend1.syncthingandroid)
- [Android WebView](https://developer.chrome.com/docs/webview)
- [CSS `update` media feature](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/update)
- [PWA install criteria, HTTPS](https://web.dev/articles/install-criteria)

First-hand user reports (lower trust, used where vendor docs are silent):

- [r/Onyx_Boox: screen stay on if plugged in (Mar 2025)](https://www.reddit.com/r/Onyx_Boox/comments/1jcy4zv/is_there_a_way_to_have_the_screen_stay_on_if/)
- [r/Onyx_Boox: Auto Sleep options (Aug 2024)](https://www.reddit.com/r/Onyx_Boox/comments/1eiomqw/auto_sleep_needs_more_options/)
- [r/Onyx_Boox: Battery protection on V4.1.1, 80% limit (Mar 2026)](https://www.reddit.com/r/Onyx_Boox/comments/1s03qux/boox_battery_protection_feature_v411_80_limit/)
- [Go 6/Go 7 recommended settings](https://note.com/yutty_note/n/n8e0ba8ae6747?hl=en)
- [BOOX overriding keep-screen-on; Auto Sleep → Never fixes it](https://www.zubersoft.com/mobilesheets/forum/archive/index.php?thread-5285-10.html=)
- [The eBook Reader: 15 tips for Onyx Boox](https://blog.the-ebook-reader.com/2019/05/02/15-tips-and-tricks-for-onyx-boox-ereaders/)
- [The eBook Reader: Boox firmware V4.1](https://blog.the-ebook-reader.com/2025/09/04/boox-firmware-update-v4-1/)
- [r/Onyx_Boox: V4.1 rolling out for Go 7](https://www.reddit.com/r/Onyx_Boox/comments/1mv2a2k/boox_firmware_v41_official_for_go_7_go_color_7/)
- [Go 7 WebView 137](https://github.com/readest/readest/issues/827)
- [r/Onyx_Boox: wall-mounting and charging 24/7](https://www.reddit.com/r/Onyx_Boox/comments/17tu6dr/planning_on_wall_mounting_my_boox_and_charging/)
- [Home Assistant community: dashboard tablet battery bloated](https://community.home-assistant.io/t/ha-dashboard-on-android-tablet-battery-bloated-use-capacitor-and-a-diode-to-trick-a-tablet-into-booting-off-usb-with-no-battery/828984)
- [r/homeassistant: wall tablets and swollen batteries](https://www.reddit.com/r/homeassistant/comments/1p7fivf/wall_tablets_and_spicy_pillows/)
- [Home Assistant community: how best to power a tablet](https://community.home-assistant.io/t/how-best-to-power-a-tablet/686488)
- [r/ObsidianMD: Obsidian on a Boox](https://www.reddit.com/r/ObsidianMD/comments/1kdgn3o/anyone_using_obsidian_on_a_boox_device_curious/)
- [lebaux.co: Obsidian on a Boox, tips](https://lebaux.co/blog/obsidian-boox-tips)

Native app, PWA and hands-free (follow-up):

- Onyx SDK: [OnyxAndroidDemo][onyx-demo], [EPD-Screen-Update.md][onyx-epd-doc], [EpdController.md][onyx-epdc-doc], [EPD-Update-Mode.md][onyx-mode-doc], [Maven metadata][onyx-maven], issues [#77][onyx-77], [#78][onyx-78], [#89][onyx-89], [#120][onyx-120]
- SDK in practice: [Notable commit][notable-commit], [Notable build.gradle][notable-gradle], [OnyxTweaks releases][onyxtweaks]
- Android: [Keep the screen on][android-screen-on], [Lock task mode][android-locktask], [Dedicated-devices cookbook][android-cookbook], [DevicePolicyManager][android-dpm], [SpeechRecognizer][android-sr]
- Web platform: [Service Worker API][sw-mdn], [getUserMedia][gum], [Using the Web Speech API][mdn-speech], [Fully JavaScript Interface][fk-js]
- BOOX voice and buttons: [BOOX blog: speech-to-text][boox-stt], [r/Onyx_Boox: Google keyboard][gboard-boox], [kvibber.com: BOOX page buttons][kvibber], [capyreader: Go 7 buttons send PgUp/PgDn][capy]
- BOOX kiosk reports: [dpm set-device-owner blocked][dpm-boox], [launcher on Go 7][launcher-go7], [launcher reverts][launcher-revert]
- WebView speech: [AABrowser PR (Chromium issue 40417848)][aabrowser], [Stack Overflow][so-webview-speech]
- Offline speech: [Vosk models][vosk-models], [Vosk vocabulary adaptation][vosk-adapt], [Porcupine][porcupine], [Picovoice FAQ][pv-faq], [openWakeWord][oww]
- Pedals: [AirTurn PED500 manual][airturn], [PageFlip Dragonfly][pageflip]

Secondary design guidance:

- [bigiron.cc: e-ink dashboards, Kindle vs Boox vs TRMNL](https://www.bigiron.cc/guides/e-ink-dashboards-for-the-homelab-kindle-boox-trmnl)
- [epaper-components.dev: designing interfaces for e-ink](https://epaper-components.dev/guides/designing-for-eink/)
- [iviv.hu: e-ink design principles for web and apps](https://iviv.hu/posts/780333)

[go7]: https://shop.boox.com/products/go7
[sleep]: https://help.boox.com/653d4/bf180/f6bee
[sleep-tab]: https://help.boox.com/fa5fa/23ee5/2f5e5
[display]: https://help.boox.com/653d4/bf180/d7e0b
[screensaver]: https://help.boox.com/653d4/bf180/6e1b9
[refresh]: https://help.boox.com/653d4/964c1/2b21d
[einkwise]: https://help.boox.com/653d4/964c1/a3f4a
[appopt]: https://help.boox.com/653d4/914cc/dd66a
[appmgmt]: https://help.boox.com/653d4/914cc/c5927
[fw41]: https://shop.boox.com/blogs/news/boox-firmware-v4-1-overview-of-new-features-and-upgrades
[onyx-guide]: https://github.com/onyx-intl/OnyxAndroidDemo/blob/master/doc/Eink-Develop-Guide.md
[fk-all]: https://www.fully-kiosk.com/docs/en/features/all
[fk-reload]: https://www.fully-kiosk.com/docs/en/configuration/web-auto-reload
[fk-power]: https://www.fully-kiosk.com/docs/en/configuration/power
[fk-rest]: https://www.fully-kiosk.com/docs/en/api/rest
[fk-lic]: https://www.fully-kiosk.com/docs/en/legal/fully-plus-license
[obs-price]: https://obsidian.md/pricing
[st-readme]: https://github.com/syncthing/syncthing-android/blob/main/README.md
[st-disc]: https://forum.syncthing.net/t/discontinuing-syncthing-android/23002
[st-fork]: https://play.google.com/store/apps/details?id=com.github.catfriend1.syncthingandroid
[webview-docs]: https://developer.chrome.com/docs/webview
[mdn-update]: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/update
[pwa]: https://web.dev/articles/install-criteria
[never-reddit]: https://www.reddit.com/r/Onyx_Boox/comments/1jcy4zv/is_there_a_way_to_have_the_screen_stay_on_if/
[autosleep-reddit]: https://www.reddit.com/r/Onyx_Boox/comments/1eiomqw/auto_sleep_needs_more_options/
[protect-reddit]: https://www.reddit.com/r/Onyx_Boox/comments/1s03qux/boox_battery_protection_feature_v411_80_limit/
[yutty]: https://note.com/yutty_note/n/n8e0ba8ae6747?hl=en
[mobilesheets]: https://www.zubersoft.com/mobilesheets/forum/archive/index.php?thread-5285-10.html=
[ebr-tips]: https://blog.the-ebook-reader.com/2019/05/02/15-tips-and-tricks-for-onyx-boox-ereaders/
[ebr-41]: https://blog.the-ebook-reader.com/2025/09/04/boox-firmware-update-v4-1/
[fw41-go7]: https://www.reddit.com/r/Onyx_Boox/comments/1mv2a2k/boox_firmware_v41_official_for_go_7_go_color_7/
[webview-go7]: https://github.com/readest/readest/issues/827
[wallmount-reddit]: https://www.reddit.com/r/Onyx_Boox/comments/17tu6dr/planning_on_wall_mounting_my_boox_and_charging/
[ha-swell]: https://community.home-assistant.io/t/ha-dashboard-on-android-tablet-battery-bloated-use-capacitor-and-a-diode-to-trick-a-tablet-into-booting-off-usb-with-no-battery/828984
[ha-spicy]: https://www.reddit.com/r/homeassistant/comments/1p7fivf/wall_tablets_and_spicy_pillows/
[ha-power]: https://community.home-assistant.io/t/how-best-to-power-a-tablet/686488
[obs-reddit]: https://www.reddit.com/r/ObsidianMD/comments/1kdgn3o/anyone_using_obsidian_on_a_boox_device_curious/
[obs-lebaux]: https://lebaux.co/blog/obsidian-boox-tips
[bigiron]: https://www.bigiron.cc/guides/e-ink-dashboards-for-the-homelab-kindle-boox-trmnl
[epaper-design]: https://epaper-components.dev/guides/designing-for-eink/
[iviv]: https://iviv.hu/posts/780333

[^fk-all]: [Fully Kiosk, all features][fk-all]
[^neo]: [NeoBrowser][neo]
[^pwa]: [web.dev install criteria][pwa]
[^fk-reload]: [Fully, Web Auto Reload][fk-reload]
[^fk-rest]: [Fully, REST API][fk-rest]
[^fk-lic]: [Fully PLUS license][fk-lic]
[^obs-price]: [Obsidian pricing][obs-price]
[^st]: [Syncthing-Fork][st-fork]

[neo]: https://help.boox.com/653d4/914cc/5040c
[^keepon]: [Android: keep the screen on][android-screen-on]
[^mobilesheets]: [MobileSheets forum: BOOX sleeps despite keep-screen-on][mobilesheets]
[^locktask]: [Android: lock task mode][android-locktask], [dedicated-devices cookbook][android-cookbook]
[^dpm-boox]: [r/Onyx_Boox: `dpm set-device-owner` blocked on BOOX][dpm-boox], [OnyxAndroidDemo #77 (unanswered kiosk question)][onyx-77]
[^launcher-go7]: [r/Onyx_Boox: home launcher on Go 7][launcher-go7], [changing launchers][launcher-revert]
[^onyx-epd]: [Onyx EPD-Screen-Update.md][onyx-epd-doc], [EPD-Update-Mode.md][onyx-mode-doc]
[^onyx-epdc]: [Onyx EpdController.md][onyx-epdc-doc]
[^sw]: [MDN: Service Worker API (secure contexts only)][sw-mdn]

[onyx-maven]: https://repo.boox.com/repository/maven-public/com/onyx/android/sdk/onyxsdk-device/maven-metadata.xml
[onyx-demo]: https://github.com/onyx-intl/OnyxAndroidDemo
[onyx-epd-doc]: https://github.com/onyx-intl/OnyxAndroidDemo/blob/master/doc/EPD-Screen-Update.md
[onyx-epdc-doc]: https://github.com/onyx-intl/OnyxAndroidDemo/blob/master/doc/EpdController.md
[onyx-mode-doc]: https://github.com/onyx-intl/OnyxAndroidDemo/blob/master/doc/EPD-Update-Mode.md
[onyx-issues]: https://github.com/onyx-intl/OnyxAndroidDemo/issues
[onyx-77]: https://github.com/onyx-intl/OnyxAndroidDemo/issues/77
[onyx-78]: https://github.com/onyx-intl/OnyxAndroidDemo/issues/78
[onyx-89]: https://github.com/onyx-intl/OnyxAndroidDemo/issues/89
[onyx-120]: https://github.com/onyx-intl/OnyxAndroidDemo/issues/120
[notable-commit]: https://github.com/Ethran/notable/commit/eb74903288df9a51e7346ce753ace4bcbd62c364
[notable-gradle]: https://github.com/Ethran/notable/blob/main/app/build.gradle
[onyxtweaks]: https://github.com/timschneeb/OnyxTweaks/releases
[android-screen-on]: https://developer.android.com/develop/background-work/background-tasks/awake/screen-on
[android-cookbook]: https://developer.android.com/work/dpc/dedicated-devices/cookbook
[android-dpm]: https://developer.android.com/reference/android/app/admin/DevicePolicyManager
[android-locktask]: https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode
[android-sr]: https://developer.android.com/reference/android/speech/SpeechRecognizer
[dpm-boox]: https://www.reddit.com/r/Onyx_Boox/comments/1ihrbpy/using_adb_to_setdeviceowner/
[launcher-go7]: https://www.reddit.com/r/Onyx_Boox/comments/1t7c7b7/home_launcher_wont_work_on_boox_go_7/
[launcher-revert]: https://www.reddit.com/r/Onyx_Boox/comments/1g5jqss/changing_launchers/
[sw-mdn]: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
[gum]: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
[mdn-speech]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API
[kvibber]: https://kvibber.com/tech-tips/boox-page-buttons/
[capy]: https://github.com/jocmp/capyreader/discussions/845
[fk-js]: https://www.fully-kiosk.com/docs/en/api/javascript
[boox-stt]: https://shop.boox.com/blogs/news/maximize-your-input-speed
[gboard-boox]: https://www.reddit.com/r/Onyx_Boox/comments/1e10a6p/google_keyboard/
[aabrowser]: https://github.com/kododake/AABrowser/pull/44
[so-webview-speech]: https://stackoverflow.com/questions/40337687/android-webview-and-speechrecognition-api
[vosk-models]: https://alphacephei.com/vosk/models
[vosk-adapt]: https://alphacephei.com/vosk/adaptation
[porcupine]: https://picovoice.ai/docs/porcupine/
[pv-faq]: https://picovoice.ai/docs/faq/general/
[oww]: https://github.com/dscripka/openWakeWord
[airturn]: https://www.keepdrum.de/media/products/ped500%20Bedienungsanleitung.pdf
[pageflip]: https://www.pageflip.com/products/dragonfly
