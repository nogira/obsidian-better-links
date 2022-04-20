import { requestUrl } from 'obsidian';

const AUTHORIZATION = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"

async function getGuestToken() {
    /*
    get "x-guest-token" for subsequent requests
    */
    const obj = await requestUrl({
        url: "https://api.twitter.com/1.1/guest/activate.json",
        method: "POST",
        headers: {
            "authorization": AUTHORIZATION,
        },
    }).then(r => r.json);
    return obj?.guest_token;
}

export async function getTweets(tweetID: string, includeRecommendedTweets: boolean = false) {
    const variables = {
        "focalTweetId":tweetID,
        "with_rux_injections":includeRecommendedTweets, // true = include recommended tweets
        "includePromotedContent":false, // true = include promoted tweets (ads)
        "withCommunity":true, // 🚨🚨🚨🚨🚨 idk???? could be related to promoted content or rux injections
        "withQuickPromoteEligibilityTweetFields":false, // 🚨🚨🚨🚨🚨 idk???? could be related to promoted content or rux injections
        "withBirdwatchNotes":false, // true = add "has_birdwatch_notes" key (val is bool) to tweet_results.result
        "withSuperFollowsUserFields":false, // true = add "super_follow_eligible", "super_followed_by", and "super_following" keys (vals are bool) to user_results.result
        "withDownvotePerspective":false, // 🚨🚨🚨🚨🚨 ACCESS DENIED for true RN, but prob num of downvotes
        "withReactionsMetadata":false, // 🚨🚨🚨🚨🚨 ACCESS DENIED for true RN
        "withReactionsPerspective":false, // 🚨🚨🚨🚨🚨 ACCESS DENIED for true RN
        "withSuperFollowsTweetFields":false, // 🚨🚨🚨🚨🚨 idk????
        "withVoice":false, // 🚨🚨🚨🚨🚨 idk????
        "withV2Timeline":true, // slight change to a small part of the json, but irrelevant for the most part
        "__fs_responsive_web_like_by_author_enabled":false, // true added an ad.. idk why
        "__fs_dont_mention_me_view_api_enabled":false, // true = add "unmention_info" key (val is obj, but seems to always be empty, at least on guest token) to tweet_results.result
        "__fs_interactive_text_enabled":true, // 🚨🚨🚨🚨🚨 idk????
        "__fs_responsive_web_uc_gql_enabled":false, // 🚨🚨🚨🚨🚨 idk????
        "__fs_responsive_web_edit_tweet_api_enabled":false, // 🚨🚨🚨🚨🚨 idk????
    }
    let url = "https://twitter.com/i/api/graphql/L1DeQfPt7n3LtTvrBqkJ2g/TweetDetail?variables="
                + encodeURI(JSON.stringify(variables));
    const guestToken = await getGuestToken();
    const obj = await requestUrl({
        url: url,
        headers: {
            "authorization": AUTHORIZATION,
            "x-guest-token": guestToken,
        },
    }).then(r => r.json);
    const tweets = obj.data.threaded_conversation_with_injections_v2
                    .instructions[0].entries
    return tweets;
}

function parseTweetContents(tweetContents: any) {
    const mainTweet: any = {}

    mainTweet.id = tweetContents.legacy.id_str;
    mainTweet.user = tweetContents.core.user_results.result.legacy.screen_name;
    mainTweet.text = tweetContents.legacy.full_text;
    
    const media = tweetContents.legacy.entities?.media;
    if (media) {
        mainTweet.media = []
        for (const img of media) {
            const item: any = {}
            item.twitterLink = img.url;
            item.url = img.media_url_https;
            item.type = img.type; // photo or video
            mainTweet.media.push(item);
        }
    }
    const urls = tweetContents.legacy.entities.urls;
    if (urls.length > 0) {
        mainTweet.urls = [];
        for (const url of urls) {
            const item: any = {}
            item.twitterLink = url.url;
            item.url = url.expanded_url;
            mainTweet.urls.push(item);
        }
    }
    const isQuote = tweetContents?.quoted_status_result
    if (isQuote) {
        const quoteContents = tweetContents.quoted_status_result.result
        mainTweet.quote = parseTweetContents(quoteContents)
        mainTweet.quote.url = tweetContents.legacy.quoted_status_permalink
        delete mainTweet.quote.url.display
    }

    return mainTweet;
}

export async function tweetsFromURL(url: string) {
    /*
    get the tweets in a parsed format (most of the junk removed)

    returns a list of tweets, starting with the first tweet
    
    tweets contain
        - id
        - user
        - text
        - media
            - twitterLink (the twitter url shortener)
            - url (the original image url)
            - type (photo or video)
        - urls
            - twitterLink (the twitter url shortener)
            - url (the original url)
        - quote (the quoted tweet if it's a quote tweet)
            - * all the same as other tweets contain (everything above) *

    if more information is required than listed above, use getTweets() instead
    */
    const url_id = url.split("/")[5];
    const tweets = await getTweets(url_id);
    const allTweets = [];
    // -- find main tweet --
    // need to do this bc even though usually the top furst tweet is the main 
    // tweet, if the tweet is halfway down a thread it wont be the first tweet
    let i;
    for (i=0; i < tweets.length; i++) {
        const tweet = tweets[i];
        const entryId = tweet.entryId;
        const id = entryId.substring(6, entryId.length);
        if (id === url_id) {
            break;
        }
    }

    {
        const tweet = tweets[i];
        const tweetContents = tweet.content.itemContent.tweet_results.result
        const mainTweet = parseTweetContents(tweetContents)
        allTweets.push(mainTweet);
    }
    // only get thread if main tweet is first tweet





    // 🚨🚨🚨🚨 ACTUALLY, ONLY GET THREAD IF ITS THE FIRST TWEET, OR IF THE TWEET RIGHT 
    // ABOVE IT IS A DIFFERENT USER





    if (i === 0) {
        const tweetThread = tweets[1];
        const tweetThreadItems = tweetThread.content.items;
        for (const tweetItem of tweetThreadItems) {
            const tweetContents = tweetItem.item.itemContent.tweet_results.result;
            const tweet = parseTweetContents(tweetContents);
            // check if tweet is in thread, if not then it is a reply so exit
            if (tweet.user !== allTweets[0].user) {
                break;
            }
            allTweets.push(tweet);
        }
    }
    return allTweets;
}
