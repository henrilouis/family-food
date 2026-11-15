# How should a Boox Go 7 show a kitchen page?

Research for [#3](https://github.com/henrilouis/food-automation/issues/3). Researched November 2026. Vocabulary follows `GLOSSARY.md`; "Kitchen Display" is the Boox Go 7 in the kitchen.

## Answer

Run the Kitchen Display as a **plain web page shown full-screen in Fully Kiosk Browser**. Set the Boox to **never sleep** and keep it **plugged in, with battery protection on**. The page is a small, static-first, black-on-white HTML page served on the LAN (the Pi's job). It **checks a tiny version file every few minutes and reloads only when the Week Menu changed**. Taps ("cooked", 👍/👎) are ordinary `fetch()` POSTs to the same server.

- **Obsidian on Android** is a credible plan B. It needs no server, and taps would edit vault notes directly. But it is a poor fit for a kiosk: dense UI, no auto-start or auto-reload, kids can edit notes, and it needs Obsidian Sync or Syncthing-Fork to get the vault onto the device.
- **The Boox's own browsers (NeoBrowser, Chrome)** work for trying things out. They lack auto-start on boot, a locked full-screen mode and reload control. A full-screen installed web app (PWA) would fix some of that, but it needs HTTPS, which is awkward on a home LAN.

## The device (facts)

| Property | Value | Source |
| --- | --- | --- |
| Screen | 7" monochrome Carta 1300, 1680 × 1264, 300 ppi, capacitive touch | [BOOX Go 7 product page][go7] |
| OS | Android 13, Google Play built in, 3rd-party apps supported | [BOOX Go 7 product page][go7] |
| SoC / memory | Octa-core, 4 GB RAM, 64 GB storage | [BOOX Go 7 product page][go7] |
| Buttons | Power button, physical page-turn buttons | [BOOX Go 7 product page][go7] |
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

### Why not Obsidian as the primary route

- The vault has to live on the device. The official Syncthing Android app was discontinued in December 2024 ([Syncthing forum][st-disc], [syncthing-android README][st-readme]). The maintained option is **Syncthing-Fork** ([Play Store listing][st-fork]). The paid alternative is **Obsidian Sync** ([pricing][obs-price]).
- BOOX freezes background apps to save power ([App Management Settings › App Freeze][appmgmt]). So sync only runs reliably while Obsidian is in the foreground.
- Obsidian on a Boox works fine for reading. Users recommend a light, high-contrast theme and few plugins ([r/ObsidianMD thread][obs-reddit], [lebaux.co][obs-lebaux]). But it is an editor, not a glanceable kitchen board, and a child's tap can change a note.
- **Keep in mind**: it is the only route with no Pi and with write-back for free. Tapping a `- [ ] cooked` checkbox in reading view edits the Recipe note itself. If the Pi turns out to be a burden, this is the fallback.

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
- #11 (architecture): the page only needs a LAN HTTP server that serves static HTML plus a version file and accepts tap POSTs. A Pi 3 is more than enough. Obsidian-on-Boox could remove the Pi entirely, at the cost of a worse kiosk experience.

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
