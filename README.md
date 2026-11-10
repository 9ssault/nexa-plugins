# nexa plugins

four small plugins i use on nexa. paste one into nexa's plugin box and turn it on.

## mass-accounts.min.js

keeps all your accounts in one place.

- see every account you saved
- switch between them
- add more accounts than the menu normally lets you
- join a server with every account at once
- leave a server with every account at once
- set the same tag or profile picture on all of them
- keep them signed in and sync them to the other plugins

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

## how to use

open nexa, go to plugins, paste a file in, turn it on.

mass-accounts holds the account list the others read, so load it before the rest.

## install from a link

nexa can also install a plugin straight from a url. open the plugin box, pick the option to add one from a link, and paste one of these:

- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/mass-accounts.min.js
- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/toolbox.js
- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/say.js
- https://raw.githubusercontent.com/9ssault/nexa-plugins/main/rpc-presence-rotation.js

use the link for mass-accounts, it is a little past what the paste box takes. the other three install fine either way.
