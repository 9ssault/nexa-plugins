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
- connects the accounts in the background instead of all at once
- waits for nexa to finish logging you in first
- sends the gateway heartbeat so the connections stay up
- backs off when nexa says your network has too many connections
- tells you which accounts need you to sign in again

the switch and the numbers are in nexa's plugin settings, under stay online. the account you are using already counts as online, so you do not lose a slot to it.

it reads the same account list mass-accounts saves. this replaces the keep online switch that used to be inside mass-accounts.

### more than 250 accounts

helium is chromium based, so it shares the same websocket limit as every other browser nexa runs in. one browser profile can hold about 255 connections at once. that is the whole profile, not one tab, and a worker does not get around it. stay online keeps 220 accounts per profile by default so the app still has room.

when the saved list is bigger than that, the plugin splits it into chunks of 220 on its own. a profile takes the chunk that contains the account it is signed into. the panel shows the range and names the first account of the next chunk, so a second profile picks up exactly where the first one stopped.

1. open the stay online panel in the first profile. it shows the range, for example `this profile holds accounts 1 to 220 of 320`, and names the account at number 221.
2. in the first profile's console run `copy(localStorage.getItem("ec.accounts"))` to copy the account list.
3. make a second browser profile and sign in with the account the panel named.
4. install mass-accounts there, run `/importcfg`, paste the list and import it. then install stay online.
5. the second profile takes accounts 221 to 320 on its own. there is nothing to set.

three profiles work the same way, one chunk each. the account you are signed into counts as online in that profile, so a chunk of 220 shows 220 online. if a chunk lands in the wrong place, the panel tells you which account the other profile should use.

## how to use

open nexa, go to plugins, paste a file in, turn it on.

mass-accounts holds the account list the others read, so load it before the rest.

## install from a link

nexa can also install a plugin straight from a url. open the plugin box, pick the option to add one from a link, and paste one of these:

- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/mass-accounts.min.js?v=2.5.1
- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/toolbox.js
- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/say.js
- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/rpc-presence-rotation.js
- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/stay-online.js?v=1.2.0

use the link for mass-accounts, it is a little past what the paste box takes. the other four install fine either way.
