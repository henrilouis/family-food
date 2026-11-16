# Setting up the Kitchen Display Pi

The Raspberry Pi 3 only serves the Kitchen Display page and display bundle as static files, with Caddy over plain HTTP on the home LAN (ADR 0002). Everything on it is set up by `food deploy`; you only flash it and make it reachable. Then set up the Boox with `docs/boox-setup.md`.

## 1. Flash the SD card

In Raspberry Pi Imager on the Mac:

1. Device: Raspberry Pi 3. OS: **Raspberry Pi OS Lite (64-bit)**. Storage: the SD card.
2. Edit the OS customisation settings:
   - Hostname: `kitchen`.
   - Username and password: pick a user (it gets passwordless `sudo`, which `food deploy` needs). Keep the password somewhere safe; SSH won't accept it after setup.
   - Wireless LAN: the home Wi-Fi's name and password, country `NL`. A Pi 3 Model B only sees 2.4 GHz networks.
   - Locale: time zone `Europe/Amsterdam`.
   - Services: enable SSH, **Allow public-key authentication only**, and paste your Mac's public key (`~/.ssh/id_ed25519.pub`; create one with `ssh-keygen -t ed25519` if it's missing).
3. Write the card, put it in the Pi and power it up. The first boot takes a few minutes.

## 2. Give it a fixed address

1. In the router's admin page, find the client named `kitchen` and add a **DHCP reservation** for its current IP (the router may call it a static lease or fixed IP).
2. Restart the Pi (unplug and replug) and check it comes back on that IP: `ping <the reserved IP>`.

## 3. Add the `kitchen` SSH alias on the Mac

The CLI reaches the Pi only as the SSH host `kitchen`. Add to `~/.ssh/config`:

```
Host kitchen
  HostName <the reserved IP>
  User <the user from Imager>
  IdentityFile ~/.ssh/id_ed25519
```

Then check it, which also accepts the Pi's host key:

```sh
ssh kitchen true           # no password prompt
ssh kitchen sudo -n true   # no password prompt: food deploy runs setup.sh this way
```

## 4. Deploy and publish

From a clean `main` that matches `origin`:

```sh
food deploy    # installs Caddy, rsync and unattended upgrades, turns SSH passwords off, uploads the page
food publish   # sends the Week Menus as a new release
```

`food deploy` prints what it changed on the Pi, then "Kitchen Display page uploaded." `food publish` prints "Kitchen Display updated (release <id>, version <hash>)."

## 5. Check it by hand

The tests only use a fake Pi, so check these once against the real one:

- [ ] `http://<the reserved IP>/` opens the Kitchen Display in a browser on the Mac, on today's ingredients (or "No Week Menu yet").
- [ ] `curl -I http://<the reserved IP>/version.json` answers 200 with `Cache-Control: no-cache`.
- [ ] `ssh kitchen ls -l /srv/kitchen/current` points at `releases/<the id food publish printed>`.
- [ ] A second `food deploy` says "The Pi was already set up; nothing changed."
- [ ] A second `food publish` with no vault changes prints the same version; three or more publishes leave only the last 3 folders in `ssh kitchen ls /srv/kitchen/releases`.
- [ ] `ssh -o PubkeyAuthentication=no kitchen` is refused (`Permission denied (publickey)`).
- [ ] With the Pi unplugged, `food publish` prints "Kitchen Display not updated, run `food publish` at home" and exits 0.
- [ ] After a Pi restart, the page and bundle are served again without running anything.

## Repairs

Run `food deploy` again to update the page or repair the Pi; it only changes what differs. If the SD card dies, flash a new one with the same Imager settings, run `ssh-keygen -R kitchen` and `ssh-keygen -R <the reserved IP>` on the Mac, then repeat steps 3 and 4.
