import { fetch } from "./fetchWrapper"

// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

const AUTHORIZATION = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const apiBase = "https://twitter.com/i/api/";
let currentGuestToken = "";
async function newGuestToken() {
    const obj = await fetch("https://api.twitter.com/1.1/guest/activate.json", {
        "method": "POST",
        "credentials": "omit",
        "headers": {
            "authorization": AUTHORIZATION
        }
    }).then((r)=>r.json()
    ).catch(()=>{
        console.log("Error fetching guest token");
        return "";
    });
    return obj?.guest_token;
}
async function idToUnparsedTweets(tweetID, includeRecommendedTweets = false) {
    const variables = {
        "focalTweetId": tweetID,
        "with_rux_injections": includeRecommendedTweets,
        "includePromotedContent": false,
        "withCommunity": true,
        "withQuickPromoteEligibilityTweetFields": false,
        "withBirdwatchNotes": false,
        "withSuperFollowsUserFields": false,
        "withDownvotePerspective": false,
        "withReactionsMetadata": false,
        "withReactionsPerspective": false,
        "withSuperFollowsTweetFields": false,
        "withVoice": false,
        "withV2Timeline": true,
        "__fs_responsive_web_like_by_author_enabled": false,
        "__fs_dont_mention_me_view_api_enabled": false,
        "__fs_interactive_text_enabled": true,
        "__fs_responsive_web_uc_gql_enabled": false,
        "__fs_responsive_web_edit_tweet_api_enabled": false
    };
    let url = apiBase + "graphql/L1DeQfPt7n3LtTvrBqkJ2g/TweetDetail?variables=" + encodeURI(JSON.stringify(variables));
    let guestToken = currentGuestToken || await newGuestToken();
    let obj;
    for (const i of [
        1,
        2
    ]){
        obj = await fetch(url, {
            "credentials": "omit",
            "headers": {
                "authorization": AUTHORIZATION,
                "x-guest-token": guestToken
            }
        }).then((r)=>r.json()
        );
        if (obj.errors) {
            guestToken = await newGuestToken();
        } else {
            break;
        }
    }
    const tweets = obj.data.threaded_conversation_with_injections_v2.instructions[0].entries;
    return tweets;
}
function parseTweetContents(tweetContents) {
    tweetContents = tweetContents.itemContent?.tweet_results?.result || tweetContents.quoted_status_result.result;
    if (tweetContents === undefined) {
        return null;
    }
    const mainTweet = {
        id: tweetContents.legacy.id_str,
        user: tweetContents.core.user_results.result.legacy.screen_name,
        text: tweetContents.legacy.full_text
    };
    const media = tweetContents.legacy.entities?.media;
    if (media) {
        mainTweet.media = [];
        for (const img of media){
            const item = {
                twitterLink: img.url,
                url: img.media_url_https,
                type: img.type
            };
            mainTweet.media.push(item);
        }
    }
    const urls = tweetContents.legacy.entities.urls;
    if (urls?.length > 0) {
        mainTweet.urls = [];
        for (const url of urls){
            const item = {
                twitterLink: url.url,
                url: url.expanded_url
            };
            mainTweet.urls.push(item);
        }
    }
    const isQuote = tweetContents?.quoted_status_result;
    if (isQuote) {
        const quote = parseTweetContents(tweetContents);
        if (quote) {
            mainTweet.quote = quote;
            mainTweet.quote.url = tweetContents.legacy.quoted_status_permalink;
            delete mainTweet.quote.url.display;
        }
    }
    return mainTweet;
}
async function urlToTweets(url) {
    const idFromInputURL = url.split("/")[5];
    const tweetGroups = await idToUnparsedTweets(idFromInputURL);
    const allParsedTweets = [];
    const mainTweetIndex = getMainTweetIndex(tweetGroups, idFromInputURL);
    const mainTweet = tweetGroupToTweets(tweetGroups[mainTweetIndex]);
    let nextTweetGroup = [];
    const nextGroup = tweetGroups[mainTweetIndex + 1];
    console.log(nextGroup);
    const isNotShowMore = nextGroup?.content?.itemContent?.cursorType !== "ShowMoreThreadsPrompt";
    const nextGroupExists = nextGroup && isNotShowMore;
    if (nextGroupExists) {
        nextTweetGroup = tweetGroupToTweets(nextGroup);
    }
    console.log("HERE");
    if (mainTweetIndex == 0) {
        allParsedTweets.push(...mainTweet);
        if (nextTweetGroup) {
            const thread = nextTweetGroup;
            if (thread?.[0]?.user === mainTweet[0].user) {
                allParsedTweets.push(...thread);
            }
        }
        return allParsedTweets;
    }
    const prevTweetGroup = tweetGroupToTweets(tweetGroups[mainTweetIndex - 1]);
    const prevTweetIsSameUser = prevTweetGroup[0].user === mainTweet[0].user;
    if (!prevTweetIsSameUser) {
        allParsedTweets.push(...mainTweet);
        if (nextTweetGroup) {
            const thread = nextTweetGroup;
            if (thread?.[0]?.user === mainTweet[0].user) {
                allParsedTweets.push(...thread);
            }
        }
        return allParsedTweets;
    }
    if (prevTweetIsSameUser) {
        allParsedTweets.push(...mainTweet);
    }
    return allParsedTweets;
}
function getMainTweetIndex(tweetGroups, idFromInputURL) {
    for(let i = 0; i < tweetGroups.length; i++){
        const entryId = tweetGroups[i].entryId;
        const id = entryId?.substring(6);
        if (id === idFromInputURL) {
            return i;
        }
    }
    return 0;
}
function tweetItemGroupToTweet(tweetContents) {
    const parsedTweet = parseTweetContents(tweetContents);
    return parsedTweet;
}
function tweetModuleGroupToTweets(tweetContents) {
    let tweets = [];
    for (const tweetItem of tweetContents){
        const tweetContents = tweetItem.item;
        console.log("tweetContents");
        console.log(tweetContents);
        if (tweetContents?.itemContent?.displayTreatment?.actionText === "Show replies") {
            break;
        }
        const parsedTweet = parseTweetContents(tweetContents);
        if (parsedTweet === null) {
            break;
        }
        tweets.push(parsedTweet);
    }
    return tweets;
}
function tweetGroupToTweets(tweetGroup) {
    const returnTweets = [];
    const contents = tweetGroup.content?.items;
    if (contents) {
        const tweets = tweetModuleGroupToTweets(contents);
        if (tweets) {
            returnTweets.push(...tweets);
        }
    } else {
        const tweet = tweetItemGroupToTweet(tweetGroup.content);
        if (tweet) {
            returnTweets.push(tweet);
        }
    }
    return returnTweets;
}
async function queryToUnparsedTweets(query) {
    const params = {
        include_profile_interstitial_type: "1",
        include_blocking: "1",
        include_blocked_by: "1",
        include_followed_by: "1",
        include_want_retweets: "1",
        include_mute_edge: "1",
        include_can_dm: "1",
        include_can_media_tag: "1",
        include_ext_has_nft_avatar: "1",
        skip_status: "1",
        cards_platform: "Web-12",
        include_cards: "1",
        include_ext_alt_text: "true",
        include_quote_count: "true",
        include_reply_count: "1",
        tweet_mode: "extended",
        include_entities: "true",
        include_user_entities: "true",
        include_ext_media_color: "true",
        include_ext_media_availability: "true",
        include_ext_sensitive_media_warning: "true",
        include_ext_trusted_friends_metadata: "true",
        send_error_codes: "true",
        simple_quoted_tweet: "true",
        q: query,
        tweet_search_mode: "live",
        count: "20",
        query_source: "typed_query",
        pc: "1",
        spelling_corrections: "1",
        ext: "mediaStats,highlightedLabel,hasNftAvatar,voiceInfo,enrichments,superFollowMetadata,unmentionInfo"
    };
    const paramsString = new URLSearchParams(params).toString();
    const url = apiBase + "2/search/adaptive.json?" + paramsString;
    let guestToken = currentGuestToken;
    let obj;
    for (const i of [
        1,
        2
    ]){
        obj = await fetch(url, {
            "credentials": "omit",
            "headers": {
                "authorization": AUTHORIZATION,
                "x-guest-token": guestToken
            }
        }).then((r)=>r.json()
        );
        if (obj.errors) {
            guestToken = await newGuestToken();
        } else {
            break;
        }
    }
    const gObj = obj.globalObjects;
    return [
        gObj.tweets,
        gObj.users
    ];
}
async function queryToTweets(query) {
    const [tweets, users] = await queryToUnparsedTweets(query);
    let parsedTweets = [];
    const userIdToName = {};
    for(const key in users){
        const item = users[key];
        userIdToName[item.id_str] = item.screen_name;
    }
    for(const key1 in tweets){
        const item = tweets[key1];
        const tweet = {
            id: item.id_str,
            user: userIdToName[item.user_id_str],
            text: item.full_text,
            date: item.created_at
        };
        const media = item?.entities?.media;
        if (media) {
            tweet.media = [];
            for (const img of media){
                const item = {
                    twitterLink: img.url,
                    url: img.media_url_https,
                    type: img.type
                };
                tweet.media.push(item);
            }
        }
        const urls = item?.entities?.urls;
        if (urls?.length > 0) {
            tweet.urls = [];
            for (const url of urls){
                const item = {
                    twitterLink: url.url,
                    url: url.expanded_url
                };
                tweet.urls.push(item);
            }
        }
        const hasQuote = item?.quoted_status_id_str;
        if (hasQuote) {
            tweet.quotedTweetID = hasQuote;
        }
        const hasThread = item.self_thread;
        if (hasThread) {
            tweet.isThread = true;
            tweet.threadID = hasThread.id_str;
        } else {
            tweet.isThread = false;
        }
        const retweetTweetId = item.retweeted_status_id_str;
        if (retweetTweetId) {
            tweet.retweetTweetId = retweetTweetId;
        }
        parsedTweets.push(tweet);
    }
    const tweetsMinusRetweetDupes = [];
    const trackRetweets = [];
    for (const tweet of parsedTweets){
        const isRetweetItem = tweet.retweetTweetId;
        if (isRetweetItem) {
            const id = isRetweetItem;
            const user = tweet.user;
            trackRetweets.push([
                id,
                user
            ]);
        } else {
            tweetsMinusRetweetDupes.push(tweet);
        }
    }
    parsedTweets = tweetsMinusRetweetDupes;
    for (const tweet1 of parsedTweets){
        const matches = trackRetweets.filter((x)=>x[0] === tweet1.id
        );
        if (matches) {
            tweet1.retweetedBy = matches.map((x)=>x[1]
            );
        }
    }
    const quotedIds = [];
    let tempTweets = [];
    for (const tweet2 of parsedTweets){
        const quotedTweetID = tweet2.quotedTweetID;
        if (quotedTweetID) {
            const quotedTweet = parsedTweets.find((t)=>t.id === quotedTweetID
            );
            if (quotedTweet) {
                tweet2.quote = quotedTweet;
                const queryUsers = query.match(/(?<=from:)([\w]+)/g);
                const isDiffUser = !queryUsers?.includes(quotedTweet.user);
                if (isDiffUser) {
                    quotedIds.push(quotedTweet.id);
                }
            }
        }
        tempTweets.push(tweet2);
    }
    parsedTweets = tempTweets;
    tempTweets = [];
    for (const tweet3 of parsedTweets){
        if (quotedIds.includes(tweet3.id)) {} else {
            tempTweets.push(tweet3);
        }
    }
    parsedTweets = tempTweets;
    return parsedTweets;
}
async function urlToRecommendedTweets(url) {
    const idFromInputURL = url.split("/")[5];
    const tweetGroups = await idToUnparsedTweets(idFromInputURL, true);
    const allParsedTweets = [];
    let recommendedTweets = tweetGroups[tweetGroups.length - 2].content.items;
    for (const tweet of recommendedTweets){
        const tweetContents = tweet.item;
        const parsedTweet = parseTweetContents(tweetContents);
        if (parsedTweet) {
            allParsedTweets.push(parsedTweet);
        }
    }
    return allParsedTweets;
}
export { urlToTweets as urlToTweets };
export { queryToTweets as queryToTweets };
export { urlToRecommendedTweets as urlToRecommendedTweets };
export { idToUnparsedTweets as idToUnparsedTweets };
export { queryToUnparsedTweets as queryToUnparsedTweets };
