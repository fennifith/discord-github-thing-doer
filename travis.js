'use strict';

const _fs = require('fs');
const _path = require('path');
const _request = require('then-request');
const _discord = require('discord.js');
const _client = new _discord.Client();

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

function getUser(login) {
	if (_params.githubUsers[login])
		return "<@" + _params.githubUsers[login] + ">";
	else return "@" + login;
}

/**
 * Logs a message. This will send it to the appropriate channel in the discord
 * server as well as output it in the console.
 */
async function log(message, type) {
	console.log(message);

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
	console.log("Authenticated GitHub token of @" + _user);
	console.log("Authenticated Travis token of @" + (await travisRequest("user")).login);

	let builds = (await travisRequest("builds")).builds;
	for (let i in builds) {
		_builds[builds[i].id] = builds[i].state;
	}

	setInterval(async function() {
		if (!_guild) {
			console.log("No point checking Travis builds; guild not initialized.");
			return;
		}
	
		let builds = (await travisRequest("builds")).builds;
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
					let color = 0xEDDE3F; // yellow

					if (builds[i].state == "passed") {
						message = "Build #" + builds[i].number + " passed!";
						color = 0x39AA56; // green
					} else if (builds[i].state == "failed" || builds[i].state == "errored") {
						message = "Failed build (#" + builds[i].number + ")... probably broken by " + getUser(_user) + ".";
						color = 0xDB4545; // red
					} else {
						continue;
					}

					_guild.channels.find(c => c.id === channelId).send(message, { 
						embed: {
							title: "Travis-CI Build #" + builds[i].number,
							url: "https://travis-ci.com/" + builds[i].repository.slug + "/builds/" + builds[i].id,
							color: color,
							description: "Build status: " + builds[i].state + "\n"
								+ (builds[i].commit ? "Commit: \"" + builds[i].commit.message + "\" [" + builds[i].commit.sha.substring(0, 8) + "]\n" : "")
								+ "Started by: " + getUser(builds[i].created_by.login),
							timestamp: new Date()
						}
					});
				}
			}
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
