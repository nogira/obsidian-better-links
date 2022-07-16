import { requestUrl, Editor, Vault } from 'obsidian';
import { urlToTweets } from "./twitterGuestAPI.bundle";
import { LinkFormatPluginSettings } from "./../main"

export async function linkToMarkdown(
    inputURL: string,
    type: string,
    emoji: string,
    settings: LinkFormatPluginSettings,
    editor: Editor
    ) {
    
    //replace http with https
    inputURL = inputURL.replace(/^http(?!s)/, "https");
    
    // console.log(inputURL);
    // console.log(type);
    // console.log(emoji);

    // settings
    const doGetArchive = settings.archiveLinks;

    switch (type) {
        case "tweet": {
            return await getFormattedTweets(inputURL, emoji, doGetArchive, editor);
        }

        case "video": {
            let title;
            if (/youtube\.com/.test(inputURL)) {
                title = await requestUrl({
                    url: "https://www.youtube.com/oembed?format=json&url="
                            + inputURL,
                    }).then(r => r.json)
                    .then(o => o.title);
            } else {
                title = await getTitle(inputURL);
            }
            return `${emoji} [${title}](${inputURL})`;
        }

        case "forum": {
            let title: Promise<string> | string = getTitle(inputURL);
            let outputURL;
            if (doGetArchive) {
                outputURL = await getArchivedUrl(inputURL);
            } else {
                outputURL = inputURL;
            }
            title = await title;
            if (/reddit\.com/.test(inputURL)) {
                title =  title.replace(/ : \w+$/, '');
            }
            return `${emoji} [${title}](${outputURL})`;
        }

        case "article":
        case "paper":
        default: {
            // console.log("article/paper/default");
            let title: Promise<string> | string = getTitle(inputURL);
            let outputURL;
            if (doGetArchive) {
                outputURL = await getArchivedUrl(inputURL);
            } else {
                outputURL = inputURL;
            }
            title = await title;

            return `${emoji} [${title}](${outputURL})`;
        }
    }
}

async function getFormattedTweets(
    inputURL: string,
    emoji: string,
    doGetArchive: boolean,
    editor: Editor
    ) {

    // remove all optional params from end of url bc it breaks API parsing
    inputURL = inputURL.replace(/\?.*$/, "");

    // obtain indent spacing type/length so know what to use to indent quotes

    // typescript says .config doesn't exist, but it clearly does bc it works, 
    // so just extending the type to include it
    interface RealVault extends Vault {
        config: {
            useTab: number,
            tabSize: number
        }
    }
    const obsidianVault = app.vault as RealVault;
    const obsidianConfig = obsidianVault.config;
    let indent;
    if (obsidianConfig.useTab) {
        indent = "\t";
    } else {
        indent = " ".repeat(obsidianConfig.tabSize);
    }

    // check how many indentations, and if in bullet / quote / etc
    const cursor = editor.getCursor();
    const textBeforeCursor = editor.getRange(
        { line: cursor.line, ch: 0 },
        cursor
    );
    const endsInQuote = /> $/.test(textBeforeCursor);
    const noIndent = textBeforeCursor === ""
    // if a bullet, remove the bullet from inserted indentation, but if quote or
    // nothing, leave the same
    let indentation = textBeforeCursor.replace(/[-\*] $/, '');
    // add the indentation TO THE RIGHT
    // e.g.
    //     > - 
    // to 
    //     > - link
    //     >     > text
    // but if end is quote, not bullet, the extra indentation is not added bc 
    // doesn't format properly
    //     > 
    // to 
    //     > link
    //     >     > text           <-- DOESNT WORK
    // THIS INSTEAD:
    //     > 
    // to 
    //     > link
    //     > > text
    // this doesn't work either
    // 
    // to 
    // link
    //     > text           <-- DOESNT WORK
    // must do this
    // 
    // to 
    // link
    // > text
    if (endsInQuote || noIndent) {
        // none
    } else {
        indentation = indentation + indent;
    }

    const user = inputURL.split('/')[3];
    const id = inputURL.split('/')[5];
    
    // -- NEW --
    let tweets: Promise<any[]> | any[] = urlToTweets(inputURL);
    let outputURL;
    if (doGetArchive) {
        outputURL = await getArchivedUrl(inputURL);
    } else {
        outputURL = inputURL;
    }
    tweets = await tweets;

    console.log("ONE");

    const isTweetThread = tweets.length > 1;
    if (isTweetThread) {
        emoji += "🧵";
    }

    let tweetOutputText = "";
    for (const tweet of tweets) {
        let text = tweet.text;

        function translateURLs(text: string, tweet: any) {
            // convert external links
            if (tweet?.urls) {
                for (const url of tweet.urls) {
                    text = text.replace(url.twitterLink, url.url);
                }
            }
            // remove media links
            if (tweet?.media) {
                for (const media of tweet.media) {
                    text = text.replace(media.twitterLink, "");
                }
            }
            return text
        }

        if (tweet?.quote) {
            const user = tweet.quote.user;
            const id = tweet.quote.id;
            const link = `${emoji} [@${user} ${id}](https://twitter.com/${user}/status/${id})`
            let quoteText = tweet.quote.text.replace(/^/gm, "> ");
            quoteText = translateURLs(quoteText, tweet.quote);
            text += `\n\n${link}\n${quoteText}`;
        }
        console.log("TWO");
        // add \ to front of # to prevent obsidian recognizing it as start of tag
        text = text.replace(/#/gm, "\\#");
        // add quote marks to text
        text = text.replace(/^/gm, `${indentation}> `);
        // remove spaces at end of line
        text = text.replace(/ +?$/gm, "");
        text = translateURLs(text, tweet);
        // (e.g. &amp; -> &)
        text = decodeHtmlEntities(text);
        console.log("THREE");
        tweetOutputText += `\n${text}\n`;
    }
    console.log("FOUR");
    // -- OLD -- (keep in case twitter API breaks)
    // using outputURL bc cant get title from twitter inputURL to be able to get tweet text
    // const outputURL = await getArchivedUrl(inputURL);
    // const tweet = await getTitle(outputURL)
    //                 .then(t => t?.replace(/^.*?"|"[^"]*?$/g, ''));
    return `${emoji} [@${user} ${id}](${outputURL})${tweetOutputText}`;
}

async function getArchivedUrl(url: string) {
    const archive = await requestUrl({url: 'https://archive.org/wayback/available?url=' + url})
                        .then(r => r?.json)
                        .then(o => o?.archived_snapshots);
    if (JSON.stringify(archive) === "{}") { // `archive === {}` not working ???
        return url;
    } else if (archive?.closest?.available) {
        return archive.closest.url.replace(/^http:/, "https:");
    } else {
        return url;
    }
}

function decodeHtmlEntities(str: string) {
    const node = document.createElement("div");
    node.innerHTML = str;
    return node.innerText;
};

async function getTitle(url: string) {
    return await requestUrl({url: url})
        .then((r: any) => r.text)
        // no need to parse whole html just to get title value
        .then((t: string) => {
            // console.log(t);
            let title = t.match(/(?<=<title[^>]*>)(.*?)(?=<\/title>)/gs)?.[0];
            // console.log(title);
            // don't want new line in title
            title = title.replace(/\n|\r/g, '');
            // remove whitespace from start and end
            title = title.trim();
            // decode html entities
            title = decodeHtmlEntities(title);
            return title;
        })
}
