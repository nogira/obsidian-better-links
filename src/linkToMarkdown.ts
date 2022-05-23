import { requestUrl, Editor } from 'obsidian';
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
    // obtain indent spacing type/length so know what to use to indent quotes
    const obsidianConfig = app.vault.config; // ignore warning, .config exists
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
    return str.replace(/&#?(\w+);/g, (match, dec) => {
        if(isNaN(dec)) {
            const chars: any = {quot: 34, amp: 38, lt: 60, gt: 62, nbsp: 160, copy: 169, reg: 174, deg: 176, frasl: 47, trade: 8482, euro: 8364, Agrave: 192, Aacute: 193, Acirc: 194, Atilde: 195, Auml: 196, Aring: 197, AElig: 198, Ccedil: 199, Egrave: 200, Eacute: 201, Ecirc: 202, Euml: 203, Igrave: 204, Iacute: 205, Icirc: 206, Iuml: 207, ETH: 208, Ntilde: 209, Ograve: 210, Oacute: 211, Ocirc: 212, Otilde: 213, Ouml: 214, times: 215, Oslash: 216, Ugrave: 217, Uacute: 218, Ucirc: 219, Uuml: 220, Yacute: 221, THORN: 222, szlig: 223, agrave: 224, aacute: 225, acirc: 226, atilde: 227, auml: 228, aring: 229, aelig: 230, ccedil: 231, egrave: 232, eacute: 233, ecirc: 234, euml: 235, igrave: 236, iacute: 237, icirc: 238, iuml: 239, eth: 240, ntilde: 241, ograve: 242, oacute: 243, ocirc: 244, otilde: 245, ouml: 246, divide: 247, oslash: 248, ugrave: 249, uacute: 250, ucirc: 251, uuml: 252, yacute: 253, thorn: 254, yuml: 255, lsquo: 8216, rsquo: 8217, sbquo: 8218, ldquo: 8220, rdquo: 8221, bdquo: 8222, dagger: 8224, Dagger: 8225, permil: 8240, lsaquo: 8249, rsaquo: 8250, spades: 9824, clubs: 9827, hearts: 9829, diams: 9830, oline: 8254, larr: 8592, uarr: 8593, rarr: 8594, darr: 8595, hellip: 133, ndash: 150, mdash: 151, iexcl: 161, cent: 162, pound: 163, curren: 164, yen: 165, brvbar: 166, brkbar: 166, sect: 167, uml: 168, die: 168, ordf: 170, laquo: 171, not: 172, shy: 173, macr: 175, hibar: 175, plusmn: 177, sup2: 178, sup3: 179, acute: 180, micro: 181, para: 182, middot: 183, cedil: 184, sup1: 185, ordm: 186, raquo: 187, frac14: 188, frac12: 189, frac34: 190, iquest: 191, Alpha: 913, alpha: 945, Beta: 914, beta: 946, Gamma: 915, gamma: 947, Delta: 916, delta: 948, Epsilon: 917, epsilon: 949, Zeta: 918, zeta: 950, Eta: 919, eta: 951, Theta: 920, theta: 952, Iota: 921, iota: 953, Kappa: 922, kappa: 954, Lambda: 923, lambda: 955, Mu: 924, mu: 956, Nu: 925, nu: 957, Xi: 926, xi: 958, Omicron: 927, omicron: 959, Pi: 928, pi: 960, Rho: 929, rho: 961, Sigma: 931, sigma: 963, Tau: 932, tau: 964, Upsilon: 933, upsilon: 965, Phi: 934, phi: 966, Chi: 935, chi: 967, Psi: 936, psi: 968, Omega: 937, omega: 969}
            if (chars[dec] !== undefined) {
                dec = chars[dec];
            }
        }
        return String.fromCharCode(dec);
    });
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
            // &#x27; (') gets wringly replaced with   when decodeHtmlEntities()
            // is executed, so replace in advance
            title = title.replace(/&#x27;/g, "'");
            // console.log(title);
            return title;
        })
        // still need to parse html to convert html to text (e.g. &amp; -> &)
        .then((title: string) => decodeHtmlEntities(title));
}
