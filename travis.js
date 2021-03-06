'use strict';

const _fs = require('fs');
const _path = require('path');
const _request = require('then-request');
const _discord = require('discord.js');
const _client = new _discord.Client();
const _log = require('./log.js');

var _params;
var _guild;
var _user;
var _builds = {};

/**
 * Check whether the passed string is valid to
 * pass to GitHub or not. Can include numbers, 
 * letters, dashes, or underscores, and nothing
 * else.
 * 
 * @param str			The string to check.
 */
function isValidGithubString(str) {
    return (/^[0-9A-Za-z\-_]+$/g).test(str);
}

/**
 * Request data from the GitHub API.
 * 
 * @param url			The endpoint to request data from;
 * 						not the entire URL. "https://api.github.com/"
 * 						is appended automatically.
 * @param method		(optional) the method to send the request
 * 						with; GET, POST, etc.
 * @param payload		(optional) a JSON object to send as
 * 						the request payload.
 */
async function githubRequest(url, method, payload) {
    return _request(method || 'GET', "https://api.github.com/" + url, {
        headers: { 
            "User-Agent": "fennifith",
            "Authorization": _params.token ? "token " + _params.token : null
        },
        json: payload
    }).then(function(result) {
        return JSON.parse(result.getBody('utf8'));
    }).catch(async function(err) {
        return null;
    });
}

/**
 * Request data from the GitHub API.
 * 
 * @param url			The endpoint to request data from;
 * 						not the entire URL. "https://api.github.com/"
 * 						is appended automatically.
 * @param method		(optional) the method to send the request
 * 						with; GET, POST, etc.
 * @param payload		(optional) a JSON object to send as
 * 						the request payload.
 */
async function travisRequest(url, method, payload) {
    return _request(method || 'GET', "https://api.travis-ci.com/" + url, {
        headers: { 
            "User-Agent": "Travis fennifith",
            "Travis-API-Version": 3,
            "Authorization": _params.travisToken ? "token " + _params.travisToken : null
        },
        json: payload
    }).then(function(result) {
        return JSON.parse(result.getBody('utf8'));
    }).catch(async function(err) {
        return null;
    });
}

async function bintrayRequest(url, method, payload) {
    return _request(method || 'GET', "https://bintray.com/api/v1/" + url, {
        headers: {
            "User-Agent": "github.com/fennifith/discord-github-thing-doer",
            "Authorization": "Basic " + Buffer.from(_params.bintraySubject + ":" + _params.bintrayKey).toString("base64")
        },
        json: payload
    }).then(function(result) {
        return JSON.parse(result.getBody('utf8'));
    }).catch(async function(err) {
        return null;
    });
}

function getUser(login) {
    if (_params.githubUsers[login])
        return "<@" + _params.githubUsers[login] + ">";
    else return "@" + login;
}

async function getBintrayFiles(pkg, version, timeout) {
    timeout = timeout || 100;

    if (pkg == "Status")
        pkg = "Statuss"; // I don't know, Bintray doesn't like this word for some reason....
                         // I don't want to know why.

    let files = await bintrayRequest("packages/" + _params.bintraySubject + "/" + _params.bintrayRepo + "/" + pkg + "/versions/" + version + "/files");

    if ((!files || files.length == 0) && timeout < 70000) {
        return await new Promise((resolve, reject) => {
            setTimeout(async function() {
                _log.warn("Requesting bintray files, timeout: " + timeout);
                resolve(await getBintrayFiles(pkg, version, timeout * 5));
            }, timeout);
        });
    }

    return files;
}

/**
 * Logs a message. This will send it to the appropriate channel in the discord
 * server as well as output it in the console.
 */
async function log(message, type) {
    if (typeof message === 'string')
        _log.debug(message);

    if (_guild) {
        let channel = _guild.channels.find(c => c.name == "thing-doers");
        if (channel)
            await channel.send(message);
    }
}

/**
 * Starts the discord bot. Pretty self explanatory.
 *
 * @param params	A bunch of params. Contains "githubRepos" (an object mapping channel to repository names),
 * 					and "bot" (the API token
 * 					of the discord bot to login as).
 */
async function start(params) {
    _params = params || {};

    _user = (await githubRequest("user")).login;
    _log.info("Authenticated GitHub token of @" + _user);
    _log.info("Authenticated Travis token of @" + (await travisRequest("user")).login);

    let bintrayUser = await bintrayRequest("users/" + _params.bintraySubject);
    if (bintrayUser)
        _log.info("Authenticated Bintray key of " + bintrayUser.full_name);

    let builds = (await travisRequest("builds?sort_by=finished_at:desc")).builds;
    for (let i in builds) {
        _builds[builds[i].id] = builds[i].state;

        if (builds[i].state == "ongoing")
            _log.debug("Ongoing build: #" + builds[i].number + " of " + builds[i].repository.slug);
    }

    setInterval(async function() {
        if (!_guild) {
            _log.warn("No point checking Travis builds; guild not initialized.");
            return;
        }
    
        let builds = (await travisRequest("builds?sort_by=finished_at:desc")).builds;
        let ongoing = [];
        
        for (let i in builds) {
            if (!_builds[builds[i].id] || _builds[builds[i].id] != builds[i].state) {
                _builds[builds[i].id] = builds[i].state;
                await log("Travis build updated: #" + builds[i].number + " of " + builds[i].repository.slug + " (" + builds[i].state + ")");

                let channelId = null;
                for (let id in _params.githubRepos) {
                    if (_params.githubRepos[id] == builds[i].repository.slug) {
                        channelId = id;
                        break;
                    }
                }
                
                if (channelId) {
                    let message = "Ongoing build: #" + builds[i].number + " [" + builds[i].state + "]";
                    let attachments = [];
                    let color = 0xEDDE3F; // yellow

                    if (builds[i].state == "passed") {
                        message = "Build #" + builds[i].number + " passed!";
                        color = 0x39AA56; // green

                        let files = await getBintrayFiles(builds[i].repository.slug.split("/")[1], builds[i].commit.sha);

                        if (files) {
                            await log("Found some bintray files!\n```js\n" + JSON.stringify(files, null, 2) + "\n```");
                            for (let file in files) {
                                attachments.push("[" + files[file].name + "](https://dl.bintray.com/" + _params.bintraySubject + "/" + _params.bintrayRepo + "/" + files[file].path + ")");
                            }
                        } else await log("No bintray files found for build #" + builds[i].number + " in " + builds[i].repository.slug);

                        await _client.user.setActivity(null);
                    } else if (builds[i].state == "failed" || builds[i].state == "errored") {
                        message = "Failed build (#" + builds[i].number + ")... probably broken by " + getUser(_user) + ".";
                        color = 0xDB4545; // red
                    } else {
                        ongoing.push(builds[i]);
                        continue;
                    }

                    _guild.channels.find(c => c.id === channelId).send(message, { 
                        embed: {
                            title: "Travis-CI Build #" + builds[i].number + " (" + builds[i].branch.name + ")",
                            url: "https://travis-ci.com/" + builds[i].repository.slug + "/builds/" + builds[i].id,
                            color: color,
                            description: "Build status: " + builds[i].state + "\n"
                                + (builds[i].commit ? "Commit: \"" + builds[i].commit.message + "\" [" + builds[i].commit.sha.substring(0, 8) + "]\n" : "")
                                + "Started by: " + getUser(builds[i].created_by.login) + (attachments.length > 0 ? "\nFiles: " + attachments.join(", ") : ""),
                            timestamp: new Date()
                        }
                    });
                }
            }
        }

        if (ongoing.length > 0) {
            let str = "";
            for (let i = 0; i < ongoing.length; i++) {
                str += ongoing[i].repository.slug.split("/")[1];

                if (ongoing.length - i == 1)
                    break;
                else if (ongoing.length - i == 2)
                    str += ongoing.length > 2 ? ", and " : " and ";
                else str += ", ";
            }

            await _client.user.setActivity(str, { type: 'WATCHING' });
        }
    }, 10000);

    _client.on('ready', () => {
        _guild = _client.guilds.first();
        log("I'm back online!");
    });

    _client.on('message', async function(message) {
        if (!_guild)
            _guild = message.guild; // the bot can only ever be in one server at a time, so this is probably okay
    
        if (message.content.startsWith("!travis ")) {
            if (!_guild && message.channel.type == "dm") {
                await message.channel.send("Wow, you sure caught me at a bad time. I'm a little busy right now, maybe you could try again later?"); // wow rude
                return;
            }
        
            let messageParts = message.content.split(" ");

            if (messageParts[1] === "sync") {
                //TODO: sync command
            } else { //  display help message
                await message.channel.send({ embed: {
                    title: "Travis Thing Doer Commands",
                    url: "https://jfenn.me/projects/discord-github-thing-doer",
                    fields: [
                        {
                            name: "!travis sync",
                            value: "Creates webhooks for GitHub-linked channels to receive deployments "
                                + "through Travis; sets the $DISCORD_WEBHOOK environment variable on each "
                                + "linked repository."
                        },
                        {
                            name: "!travis help",
                            value: "Displays this beautiful message."
                        }
                    ]
                }});
            }
        }
    });

    _client.login(_params.bot);
}

module.exports.start = start;
