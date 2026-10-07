#!/usr/bin/env bash
# CI only: isolate sockets by a fresh primary group, never the runner's group.
# Run after dependency/browser installation. Requires sudo, iptables, setpriv.
set -euo pipefail
[[ "$(uname -s)" == Linux ]] || { echo 'CB-02 OS guard requires Linux' >&2; exit 1; }
chain="CB02_$$"
group="cb02-$$"
uid="$(id -u)"
sudo groupadd --system "$group"
gid="$(getent group "$group" | cut -d: -f3)"
finish() {
  status=$?
  trap - EXIT
  for firewall in iptables ip6tables; do
    # Missing/malformed counters fail closed, including setup failures.
    if ! counters=$(sudo "$firewall" -w -L "$chain" -n -v -x); then
      status=1
    elif ! count=$(awk '$3 == "REJECT" {n++; sum += $1} END {if(n != 1) exit 1; print sum}' <<< "$counters"); then
      status=1
    elif [[ "$count" != 0 ]]; then
      echo "CB-02 OS outbound attempts blocked ($firewall): $count" >&2
      status=1
    fi
    sudo "$firewall" -w -D OUTPUT -m owner --gid-owner "$gid" -j "$chain" 2>/dev/null || true
    sudo "$firewall" -w -F "$chain" 2>/dev/null || true
    sudo "$firewall" -w -X "$chain" 2>/dev/null || true
  done
  sudo groupdel "$group"
  exit "$status"
}
trap finish EXIT
for firewall in iptables ip6tables; do
  sudo "$firewall" -w -N "$chain"
  if [[ "$firewall" == iptables ]]; then loopback=127.0.0.1/32; else loopback=::1/128; fi
  sudo "$firewall" -w -A "$chain" -o lo -d "$loopback" -j ACCEPT
  sudo "$firewall" -w -A "$chain" -j REJECT
  sudo "$firewall" -w -I OUTPUT 1 -m owner --gid-owner "$gid" -j "$chain"
done
# Same uid retains workspace/cache access. The dedicated gid scopes the firewall.
# Children cannot regain sudo, change identity, or alter the firewall.
sudo --preserve-env=PATH,DATABASE_URL,DETECT_LLM,CI,NEXT_TELEMETRY_DISABLED,HOME \
  setpriv --reuid="$uid" --regid="$gid" --clear-groups --bounding-set=-all \
  --inh-caps=-all --ambient-caps=-all --no-new-privs -- "$@"
