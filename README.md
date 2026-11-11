# nexa plugins

five small plugins i use on nexa. paste one into nexa's plugin box and turn it on.

## mass-accounts.min.js

keeps all your accounts in one place.

- see every account you saved
- switch between them
- add more accounts than the menu normally lets you
- join a server with every account at once
- leave a server with every account at once
- set the same tag or profile picture on all of them
- sync them to the other plugins

if you want the mass join to solve the captcha for you, paste your own yescaptcha key into the plugin settings.

## toolbox.js

a pile of small tools in one plugin.

- self react to your own messages
- auto react to people you pick
- logs edits and deletes so you can still read what a message said
- counts your messages, busiest channels and most used emoji
- rotates your status and your display name
- profile and mod helpers
- emoji picker
- silent typing, so you never show as typing

## say.js

sends from all of your saved accounts at once.

- `/say <text>` sends the same message from every account you saved
- `/rename <name>` sets the same display name on all of them
- `/sayto <channelId> <text>` does the same but to a channel id instead of the one you are in

it reads the account list that mass-accounts saves, so load mass-accounts first.

## rpc-presence-rotation.js

shows a rich presence on your profile and rotates it over time. has last.fm support, so it can show the song you are listening to.

create an application, copy the key and paste it in the field needing it, only reads your scrobbles and is never sent anywhere.
https://www.last.fm/api/account/create

## stay-online.js

keeps every saved account online while you use one of them.

- turns itself on when you add it
- keeps every account online from a small local hub when one is running, so this browser only keeps the one you are signed in to
- connects the accounts in the background instead of all at once
- waits for nexa to finish logging you in first
- sends the gateway heartbeat so the connections stay up
- backs off when nexa says your network has too many connections
- tells you which accounts need you to sign in again

the switch and the numbers are in nexa's plugin settings, under stay online. the account you are using already counts as online, so you do not lose a slot to it.

it reads the same account list mass-accounts saves. this replaces the keep online switch that used to be inside mass-accounts.

### more than 250 accounts

helium is chromium based, so it shares the same websocket limit as every other browser nexa runs in. one browser profile can hold about 255 connections at once. that is the whole profile, not one tab, and a worker or an extra tab does not get around it, because the cap belongs to the browser.

so a list bigger than that cannot all run inside one browser. instead of splitting the list by hand across profiles, stay online can hand the accounts to a tiny helper on your machine, the nexa hub. the hub holds every account socket outside the browser, so the browser only keeps the one you are signed in to and the limit stops mattering. there is no copying account lists between profiles and nothing to set up per account.

you only need the hub when your list is over about 250. under that, the plugin keeps the accounts online in the browser on its own and you can skip all of this.

1. download the hub: https://raw.githubusercontent.com/9ssault/nexa-plugins/main/nexa-hub.mjs
2. run it: `node nexa-hub.mjs`. it prints `listening on wss://localhost:8787`. leave it running.
3. to keep it running, start it however you start background programs. on a linux box with systemd, save this as `~/.config/systemd/user/nexa-hub.service` and run `systemctl --user enable --now nexa-hub`:

   ```
   [Unit]
   Description=Nexa presence hub
   After=network-online.target
   Wants=network-online.target

   [Service]
   Type=simple
   ExecStart=/usr/bin/node /path/to/nexa-hub.mjs
   Restart=always
   RestartSec=3

   [Install]
   WantedBy=default.target
   ```

4. if you use helium, add `--allow-insecure-localhost` to `~/.config/helium-browser-flags.conf` once. the hub serves its own certificate for localhost and this is what lets helium accept it. it only covers localhost and changes nothing else on the machine.

the plugin finds the hub on its own as soon as it starts. open nexa and the panel shows `via hub`. if the hub is not running, the plugin keeps the accounts online in the browser instead, and moves them over by itself the moment the hub starts. you can check the hub any time at https://localhost:8787/status.

there is nothing to copy and no second profile.

## how to use

open nexa, go to plugins, paste a file in, turn it on.

mass-accounts holds the account list the others read, so load it before the rest.

## install from a link

nexa can also install a plugin straight from a url. open the plugin box, pick the option to add one from a link, and paste one of these:

- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/mass-accounts.min.js?v=2.5.1
- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/toolbox.js
- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/say.js
- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/rpc-presence-rotation.js
- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/stay-online.js?v=1.3.0

use the link for mass-accounts, it is a little past what the paste box takes. the other four install fine either way.

if you want the accounts held outside the browser, grab the hub too:
https://raw.githubusercontent.com/9ssault/nexa-plugins/main/nexa-hub.mjs
