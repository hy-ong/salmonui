#!/bin/sh
# Runs a command in a private network namespace that has only loopback.
# On a Linux machine where other
# users start and stop Docker containers, every veth change makes Chromium
# abort its in-flight requests with net::ERR_NETWORK_CHANGED, which leaves
# dev-server pages half loaded; inside the namespace no interface changes.
# The test servers and the browser both run inside, so localhost works; the
# outside network does not (install dependencies and build first); a dummy
# interface keeps the browser online.
# Needs passwordless sudo; the command runs as the calling user with the
# calling environment. Usage: tooling/playwright/netns.sh npm run test:browser
set -eu
[ "$#" -gt 0 ] || { echo "usage: $0 <command> [args...]" >&2; exit 2; }
envfile=$(mktemp)
trap 'rm -f "$envfile"' EXIT
export -p > "$envfile"
sudo -n unshare -n -- sh -c '
  ip link set lo up
  # A dummy interface with a default route, so Chromium still reports
  # navigator.onLine === true; packets to it go nowhere.
  ip link add salmon0 type dummy && ip addr add 10.254.254.1/24 dev salmon0 && ip link set salmon0 up && ip route add default dev salmon0
  user=$1; dir=$2; envfile=$3; shift 3
  exec sudo -n -u "$user" sh -c ". \"\$0\"; cd \"\$1\"; shift; exec \"\$@\"" "$envfile" "$dir" "$@"
' netns "$(id -un)" "$(pwd)" "$envfile" "$@"
