#!/usr/bin/env nu

# bundle twitter guest api: https://github.com/nogira/deno-twitter-guest-api
cd '~/Documents/Obsidian Vaults/General/.obsidian/plugins/obsidian-better-links/src'
deno bundle '~/Documents/github/deno-twitter-guest-api/mod.ts' ./twitterGuestAPI.bundle.js

(
    open twitterGuestAPI.bundle.js |
    # add this to line 1 of twitterGuestAPI.bundle.js
    # import { fetch } from "./fetchWrapper"
    str replace ^ "import { fetch } from \"./fetchWrapper\"\n\n" |
    # have to also replace
    # let currentGuestToken = await getNewGuestToken();
    # with
    # let currentGuestToken = "";
    # bc top level await not supported
    str replace 'let currentGuestToken = await newGuestToken\(\);' 'let currentGuestToken = "";' |
    # and the first
    # let guestToken = currentGuestToken;
    # with
    # let guestToken = currentGuestToken || await getNewGuestToken();
    str replace 'let guestToken = currentGuestToken;' 'let guestToken = currentGuestToken || await newGuestToken();' |
    save twitterGuestAPI.bundle.js
)
