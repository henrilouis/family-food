#!/usr/bin/env bash
# Sets up, updates or repairs the Kitchen Display Pi (Raspberry Pi OS Lite 64-bit).
#
# `food deploy` uploads this folder to ~/family-food-setup on the Pi and runs this script as root
# through `sudo`. It is idempotent: it only changes what differs from this folder, and a second run
# reports that nothing changed. The Pi serves static files with Caddy over plain HTTP on the LAN and
# runs nothing else: no app, no Node, no monitoring (ADR 0002).
#
#   /srv/kitchen/page/            the page, uploaded by `food deploy` after this script
#   /srv/kitchen/releases/<id>/   display bundles, uploaded by `food publish`
#   /srv/kitchen/current          symlink to the release Caddy serves, switched by `food publish`
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
owner="${SUDO_USER:?Run this through sudo as the user food deploy logs in as.}"
web_root=/srv/kitchen
changes=()

# place <file> <destination> <mode>: installs a file from this folder unless it is already there.
place() {
  cmp -s "$1" "$2" && return 0
  install -D -m "$3" "$1" "$2"
  changes+=("$2")
}

# Packages, from Debian.
missing=()
for package in caddy rsync unattended-upgrades; do
  dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q "ok installed" || missing+=("$package")
done
if ((${#missing[@]})); then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq "${missing[@]}"
  changes+=("installed ${missing[*]}")
fi

# Unattended security upgrades.
place "$here/auto-upgrades.conf" /etc/apt/apt.conf.d/20auto-upgrades 644
systemctl enable --quiet --now apt-daily.timer apt-daily-upgrade.timer unattended-upgrades

# Key-only SSH, but never lock out the owner: they must already log in with a key.
home="$(getent passwd "$owner" | cut -d: -f6)"
if [[ ! -s "$home/.ssh/authorized_keys" ]]; then
  echo "Not turning off SSH passwords: $home/.ssh/authorized_keys is empty. Add your SSH key first." >&2
  exit 1
fi
before=${#changes[@]}
place "$here/sshd.conf" /etc/ssh/sshd_config.d/00-family-food.conf 644
if ((${#changes[@]} > before)); then
  sshd -t
  systemctl reload ssh
fi

# The web root, owned by the owner so `food deploy` and `food publish` write it without sudo.
for dir in "$web_root" "$web_root/page" "$web_root/releases"; do
  [[ -d "$dir" ]] || changes+=("$dir")
  install -d -o "$owner" -g "$owner" -m 755 "$dir"
done

# Caddy, serving the web root.
before=${#changes[@]}
if ! cmp -s "$here/Caddyfile" /etc/caddy/Caddyfile; then
  caddy validate --adapter caddyfile --config "$here/Caddyfile" >/dev/null
fi
place "$here/Caddyfile" /etc/caddy/Caddyfile 644
systemctl enable --quiet --now caddy
if ((${#changes[@]} > before)); then
  systemctl reload caddy
fi

if ((${#changes[@]})); then
  echo "Changed on the Pi:"
  printf '  %s\n' "${changes[@]}"
else
  echo "The Pi was already set up; nothing changed."
fi
