---
name: adb-local
description: Debug Android devices on this Mac's local network over adb — pair, connect, install APKs on the TV box (192.168.0.215). Everything rides python TCP relays because local VPN/proxy software intercepts adb's own outbound dials.
---

# adb on the local network (TV box + relays)

Local, deliberately UNCOMMITTED skill (environment facts, not project code).
Paths below are relative to the mellifera repo root; the relay scripts live
beside this file and exist only on this Mac.

## The interception law (read first)

This Mac's `adb` binary cannot reach LAN devices directly: local VPN/proxy
software intercepts its outbound TCP dials (process scan matched
clash|surge|sing-box|xray|v2ray|wireguard|tailscale — 2 live; route to en0
is direct, no system proxy set). python / nc / ssh dial DIRECT fine.

Symptoms when adb goes direct: `No route to host` on a host that pings;
`protocol fault (couldn't read status message)` on pair/connect — even with
a fresh, unexpired code.

**LAW: every adb network exchange flows through a python TCP relay**
(the adb server dials 127.0.0.1 — loopback is never intercepted — and python
dials the box). Scripts beside this file:

- `relay_serve.py <listen> <tv_port>` — persistent transport relay,
  127.0.0.1:`<listen>` → 192.168.0.215:`<tv_port>`, fork-per-client. Run it
  in the background and keep it alive for the WHOLE adb session — if it
  dies, the transport dies (re-run relay + `adb connect`).
- `relay_pair.py <pairing_port> <code>` — one-shot: relay on
  127.0.0.1:15000 + drives `adb pair` through it.

Canonical binary (full path — keep one): 
`/Users/aldfiar/Library/Android/sdk/platform-tools/adb`

## Device facts (verified 2026-11-12)

- TV box "Smart TV Pro", Android 14: **192.168.0.215**. Its own pairing
  screen shows a bogus `192.168.0.25` — 100% packet loss on ping. Aim
  everything at .215 (adb listeners bind all interfaces).
- This Mac: 192.168.0.83.
- Port **5555** = classic adbd listener (legacy AUTH; authorizes
  automatically once your adb key is paired on the box).
- Wireless-debugging TLS ports: pairing port = random, shown together with
  the 6-digit code (expires ~30–60 s); connect port = separate random high
  port, shown as "IP address & Port" on the MAIN Wireless debugging screen.
  `adb mdns services` comes back EMPTY here — discovery is dead, don't wait
  on it.

## Pairing (once, until the box forgets the key)

1. TV: Developer options → Wireless debugging → "Pair device with code" →
   read the port + 6-digit code.
2. Run immediately (expiry ~30–60 s):
   `python3 .claude/skills/adb-local/relay_pair.py <PAIRING_PORT> <CODE>`
3. Success prints `Successfully paired to 127.0.0.1:15000 [guid=…]`.
   A `protocol fault` = the relay didn't carry it (or the code expired) —
   re-pair on the TV, run again THROUGH the relay; never bare `adb pair`.

## Connecting (every session)

```bash
python3 .claude/skills/adb-local/relay_serve.py 15001 5555 &   # background
/Users/aldfiar/Library/Android/sdk/platform-tools/adb connect 127.0.0.1:15001
/Users/aldfiar/Library/Android/sdk/platform-tools/adb devices -l
```

Device serial is then `127.0.0.1:15001` — pass `-s 127.0.0.1:15001`.
If 5555 refuses, read the connect port off the TV's main Wireless debugging
screen and point the relay at THAT port instead.

## Everyday commands (all through the relay transport)

- Install/replace APK (keeps app data + pairing token):
  `adb -s 127.0.0.1:15001 install -r <apk>`
- Screenshot: `adb -s 127.0.0.1:15001 exec-out screencap -p > screen.png`
- Logs: `adb -s 127.0.0.1:15001 logcat -d -t 200`
- Shell: `adb -s 127.0.0.1:15001 shell`

## Gotchas

- **A sleeping panel returns a fully black `screencap`** — send
  `input keyevent KEYCODE_WAKEUP` first (`dumpsys power | grep mWakefulness=`
  must say Awake) before concluding the app drew nothing.
- **Rapid command bursts intermittently fail with `adb: device offline`** (the
  relay connection drops between commands). Guard every batch with
  `adb -s 127.0.0.1:15001 get-state`; if not `device`, `disconnect` + `connect`
  and re-run. A dropped keyevent silently did NOT land — check the server log
  (`ssh alatoic 'docker logs mellifera --since 20s | grep 192.168.0.215'`) to see
  what the box actually requested.
- Measure TV layout with pixels, not vision: `screencap` PNG + PIL band/text-box
  scan (non-background runs → row/column bands; bright-pixel runs → glyph
  heights). For vision, downscale to 960×540 JPEG q65 first — full-res PNGs time
  out and the model hallucinates text at low quality. The installed build is not
  debuggable (`run-as` refuses) — read prefs/state from the server log instead.
- nc wedges against a dead host — probe reachability with python, not nc.
- A hanging adb command: check the relay process is still alive before
  blaming the box.
- gradle builds serialize on this Mac — never parallel gradle+adb installs
  of the same project.
