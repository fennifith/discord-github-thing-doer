'use strict';

const _fs = require('fs');
const _path = require('path');
const _request = require('then-request');
const _discord = require('discord.js');
const _client = new _discord.Client();

var _params;
var _guild;

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
 * Starts the discord bot. Pretty self explanatory.
 *
 * @param params	A bunch of params. Contains "token" (the auth token to use),
 * 					"client" (the client id of the github application for OAuth)
 * 					"githubUsers" (an object mapping users to their github logins)
 * 					"githubRepos" (an object mapping channel to repository names),
 * 					"writeGithubUsers" (a function to store modifications to the
 * 					users object), "writeGithubRepos" (a function to store
 * 					modifications to the repos object), and "bot" (the API token
 * 					of the discord bot to login as).
 */
function start(params) {
	_params = params || {};

	_client.on('ready', () => {
		console.log('Logged in as ' + _client.user.tag);
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

			// TODO: add command syntax

			{ //  display help message
				await message.channel.send({ embed: {
					title: "Travis Thing Doer Commands",
					url: "https://jfenn.me/projects/discord-github-thing-doer",
					fields: []
				}});
			}
		}
	});

	_client.login(_params.bot);
}

module.exports.start = start;
