# mx-puppet-hades
This is the start of an implementation of [mx-puppet-bridge](https://github.com/Sorunome/mx-puppet-bridge) for connecting to Hades talker (hades-talker.org 6660).  

It's pretty rough round the edges, with a pile of things still needing fixed.  But it does work in the most basic sense.

## Installation
```bash
git pull https://github.com/neilsb/mx-puppet-hades
npm install
npm run build
```
Next copy the `sample.config.yaml` to `config.yaml`, edit it and then run `npm run start -- -r` to generate a registration file.
Register that one with synapse and start the bridge with `npm run start`.

## Usage
First you create a room with the bridge bot (`@_hadespuppet_bot:YOURSERVER.COM`). Next you type `link <username> <password> [matrix name]`, e.g. `link bob p@ssw0rd`.

The option "Matrix Name" parameter is your user on matrix.  If set, when someone mentions your username on Hades your Matrix name will be added to the text to produce a matrix mention notification.

When a hades link is created, a "Puppet Number" is returned to you (e.g. 1).   To unlink a puppet just talk to the brige bot and type `unlink 1`.

## Features
Some of the features/bugs are

 * Does not handle Hades Disconnects as yet.  If the client gets disconnected from Hades stop the bridge and restart.
 * User status messages (e.g. Is Away, has logged in, has returned, etc) are purposefully hidden.  Will be enabled by a config option at some point
 * Commands canot current be on hades  (Planned for working)
 * Most system messages are hidden purposefully (Again, will be enabled via config later)
