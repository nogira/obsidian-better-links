import { fetch } from "./fetchWrapper"

// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

const AUTHORIZATION = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const apiBase = "https://twitter.com/i/api/";
let currentGuestToken = "";
async function getNewGuestToken() {
    const obj = await fetch("https://api.twitter.com/1.1/guest/activate.json", {
        "method": "POST",
        "credentials": "omit",
        "headers": {
            "authorization": AUTHORIZATION
        }
    }).then((r)=>r.json()
    ).catch(()=>""
    );
    return obj?.guest_token;
}
async function getUnparsedTweets(tweetID, includeRecommendedTweets = false) {
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
    let guestToken = currentGuestToken || await getNewGuestToken();
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
            guestToken = await getNewGuestToken();
        } else {
            break;
        }
    }
    const tweets = obj.data.threaded_conversation_with_injections_v2.instructions[0].entries;
    return tweets;
}
function parseTweetContents(tweetContents) {
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
        const quoteContents = tweetContents.quoted_status_result.result;
        mainTweet.quote = parseTweetContents(quoteContents);
        mainTweet.quote.url = tweetContents.legacy.quoted_status_permalink;
        delete mainTweet.quote.url.display;
    }
    return mainTweet;
}
async function getTweetsFromURL(url) {
    const idFromInputURL = url.split("/")[5];
    const tweetGroups = await getUnparsedTweets(idFromInputURL);
    const allParsedTweets = [];
    let i;
    for(i = 0; i < tweetGroups.length; i++){
        const entryId = tweetGroups[i].entryId;
        const id = entryId?.substring(6);
        if (id === idFromInputURL) {
            break;
        }
    }
    let mainTweetUser;
    {
        const tweet = tweetGroups[i];
        const tweetContents = tweet.content.itemContent.tweet_results.result;
        const parsedTweet = parseTweetContents(tweetContents);
        allParsedTweets.push(parsedTweet);
        mainTweetUser = parsedTweet.user;
    }
    const mainIsFirstTweet = i === 0;
    let prevTweetNotSameUser = true;
    if (!mainIsFirstTweet) {
        const prevTweet = tweetGroups[i - 1];
        const prevTweetContents = prevTweet.content.itemContent.tweet_results.result;
        const parsedPrevTweet = parseTweetContents(prevTweetContents);
        const prevTweetUser = parsedPrevTweet.user;
        prevTweetNotSameUser = prevTweetUser !== mainTweetUser;
    }
    if (mainIsFirstTweet || prevTweetNotSameUser) {
        const tweetThread = tweetGroups[i + 1];
        const tweetThreadItems = tweetThread.content.items;
        for (const tweetItem of tweetThreadItems){
            const tweetContents = tweetItem.item.itemContent.tweet_results?.result;
            if (tweetContents === undefined) {
                break;
            }
            const parsedTweet = parseTweetContents(tweetContents);
            if (parsedTweet.user !== allParsedTweets[0].user) {
                break;
            }
            allParsedTweets.push(parsedTweet);
        }
    }
    return allParsedTweets;
}
async function getUnparsedSearchQueryTweets(query) {
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
            guestToken = await getNewGuestToken();
        } else {
            break;
        }
    }
    const tweets = obj.globalObjects;
    return tweets;
}
async function getSearchQueryTweetsFromQuery(query) {
    const unparsedTweets = await getUnparsedSearchQueryTweets(query);
    const allParsedTweets = [];
    const users = unparsedTweets.users;
    const userIdToUsername = {};
    for (const item of Object.keys(users)){
        userIdToUsername[users[item].id_str] = users[item].screen_name;
    }
    const tweets = unparsedTweets.tweets;
    const tempAllParsedTweets = [];
    for (const item1 of Object.keys(tweets)){
        const tweet = {
            id: tweets[item1].id_str,
            user: userIdToUsername[tweets[item1].user_id_str],
            text: tweets[item1].full_text,
            date: tweets[item1].created_at
        };
        const media = tweets[item1]?.entities?.media;
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
        const urls = tweets[item1]?.entities?.urls;
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
        const hasQuote = tweets[item1]?.quoted_status_id_str;
        if (hasQuote) {
            tweet.quote = hasQuote;
        }
        const hasThread = tweets[item1].self_thread;
        if (hasThread) {
            tweet.isThread = true;
        } else {
            tweet.isThread = false;
        }
        tempAllParsedTweets.push(tweet);
    }
    const trackTweetIDsOfAdded = [];
    for (const tweet of tempAllParsedTweets){
        if (tweet.quote) {
            const quotedTweet = tempAllParsedTweets.find((t)=>t.id == tweet.quote
            );
            if (quotedTweet) {
                tweet.quote = quotedTweet;
                allParsedTweets.push(tweet);
                trackTweetIDsOfAdded.push(tweet.id, quotedTweet.id);
            }
        }
    }
    for (const tweet1 of tempAllParsedTweets){
        if (!trackTweetIDsOfAdded.includes(tweet1.id)) {
            allParsedTweets.push(tweet1);
        }
    }
    return allParsedTweets;
}
async function getRecommendedTweetsFromURL(url) {
    const idFromInputURL = url.split("/")[5];
    const tweetGroups = await getUnparsedTweets(idFromInputURL, true);
    const allParsedTweets = [];
    let recommendedTweets = tweetGroups[tweetGroups.length - 2].content.items;
    for (const tweet of recommendedTweets){
        const tweetContents = tweet.item.itemContent.tweet_results.result;
        const parsedTweet = parseTweetContents(tweetContents);
        allParsedTweets.push(parsedTweet);
    }
    return allParsedTweets;
}
export { getTweetsFromURL as getTweetsFromURL };
export { getSearchQueryTweetsFromQuery as getSearchQueryTweetsFromQuery };
export { getRecommendedTweetsFromURL as getRecommendedTweetsFromURL };
export { getUnparsedTweets as getUnparsedTweets };
export { getUnparsedSearchQueryTweets as getUnparsedSearchQueryTweets };
