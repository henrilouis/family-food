# Setting up the Boox as the Kitchen Display

The Boox Go 7 shows the Kitchen Display page from the Pi full-screen in Fully Kiosk Browser, awake and plugged in for good. Background and sources: decision #3 and the `research/boox-display` branch. Set up the Pi first (`docs/pi-setup.md`) and run `food publish`, so there is something to show.

BOOX settings live per app and are easy to lose (firmware updates, "Reset all app optimization"). Fully's own settings are saved in `docs/fully-settings.json`; the BOOX settings are only in this list, so redo them from here.

You can try the Boox against the Mac before the Pi is ready: `food preview --lan` and start URL `http://<the Mac's IP>:8787/`.

## Checklist

**BOOX system**

- [ ] Wi-Fi: the home network, the same one the Pi is on.
- [ ] Settings › Date & time: automatic, time zone Amsterdam. The page's "today" and its 03:00 day change come from the Boox's clock.
- [ ] Settings › Power › **Auto Sleep: Never** and **Auto Shutdown: Never**. Fully's "keep screen on" alone is not enough: BOOX firmware overrides it, and in sleep Wi-Fi drops and the page stops.
- [ ] Settings › Power › **Protect battery** on (charging stops at 80%). The Boox stays **plugged in** all the time.
- [ ] Front light off.

**Fully Kiosk Browser**

- [ ] Install Fully Kiosk Browser from Google Play and buy **PLUS** (€8.90, one-time, from Fully's menu). Without it, kiosk mode shows a watermark.
- [ ] Web Content Settings › **Start URL: `http://<the Pi's reserved IP>/`** (plain HTTP, no port).
- [ ] Device Management: Keep Screen On, Launch on Boot.
- [ ] Web Auto Reload: Reload on Page Error and Reload on Network Reconnect on; Auto Reload on Idle **off** (the page reloads itself when a Publish changes the bundle, and an idle reload only flashes the panel).
- [ ] Kiosk Mode (PLUS): on, with a **kiosk PIN** (not 1234; keep it with the household's passwords). Let Fully become the home app.
- [ ] Other Settings › **Export Settings** writes `fully-settings.json` (PINs and passwords are encrypted). Copy it to the Mac and commit it as `docs/fully-settings.json`. Export and commit again after any change.

**BOOX per-app settings for Fully** (long-press Fully's icon, or Settings › Apps)

- [ ] App Freeze: **off** for Fully (unfrozen), and "Stay active in the background" on.
- [ ] EinkWise (Control Center) with Fully open: **HD** mode. Try Regal only if ghosting builds up.
- [ ] App Optimization › Others › Custom side buttons: **Page turning**, so the buttons send PageDown/PageUp.
- [ ] Only if ghosting builds up: "Automatic full-refresh when switching pages", or a lower Settings › System Display › Full-refresh Frequency.

## Check it on the device

- [ ] After a restart, the Boox opens Fully by itself on **today's ingredients**, in kiosk mode.
- [ ] The kiosk is locked: no way out to Android without the PIN; a test exit with the PIN works.
- [ ] The **physical page buttons** page the deck: forward through the steps, back to the week screen. Try it with a knuckle.
- [ ] By eye from the counter: contrast, text sizes, ghosting after paging through a whole recipe; the week screen's "Published …" time.
- [ ] **Reload after a Publish**: open a step, change a Recipe or Week Menu on the Mac, `food publish`, and within about 5 minutes the page reloads on the same step. A `food publish` that changes nothing doesn't reload it.
- [ ] Paging still works the next morning; after 03:00 the page is on the new day's ingredients.
- [ ] A day later, the battery sits at about 80% and the screen hasn't slept.
