'use strict';

const _os = require('os');
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
		return JSON.parse(result.getBody('utf8'))
	}).catch(async function(err) {
		return null;
	});
}

/**
 * Create an embed field based on all known data about a user
 * from their GitHub login.
 * 
 * @param userId		The GitHub login of the user.
 */
async function getGithubUserField(userId) {
	let user = await githubRequest("users/" + userId);
	if (user && user.login) {
		let text = " | [GitHub](" + (user.html_url || "https://github.com/" + userId) + ")";
		
		if (user.blog && user.blog.length > 0)
			text += " | [Website](" + user.blog + ")";

		if (_params.githubUsers[user.login])
			text = "<@" + _params.githubUsers[user.login] + ">" + text;
		else text = "@" + user.login + " (Not authenticated)" + text;
		
		return {
			name: user.name && user.name.length > 0 ? user.name : user.login,
			value: text
		};
	} else return null;
}

/**
 * Performs the magic to create and link a channel to a specific
 * GitHub repository. This includes creating a channel (if it doesn't
 * already exist), setting the topic, placing it in a category, and
 * creating a webhook from the GitHub repository to the channel.
 * 
 * @param message		The message sent to link the repositories;
 * 						used only to reply with status messages and
 * 						such.
 * @param repo			The repository object to link; returned by
 * 						the GitHub API.
 * @param category		The category to place the linked channel
 * 						under.
 */
async function linkRepo(message, repo, category) {
	let name = repo.name.toLowerCase().replace(/[._]/g, '-');
	await log("Linking " + repo.full_name + " -> #" + name);
				
	let channel;
	if (_guild.channels.exists(c => c.name === name)) {
		channel = _guild.channels.find(c => c.name === name);
	} else {
		channel = await _guild.createChannel(name, "text");
		await message.channel.send("New project: <https://github.com/" + repo.full_name + "> -> <#" + channel.id + ">");
	}

	_params.githubRepos[channel.id] = repo.full_name;
	if (_params.writeGithubRepos)
		_params.writeGithubRepos(_params.githubRepos);
	else console.error("Unimplemented method: writeGithubRepos(repos)");

	if (category) {
		await channel.setParent(category).catch(function(e) {
			console.log(e);
		});
	}
						
	await channel.setTopic(repo.description);
	
	let webhooks = await channel.fetchWebhooks();
	let webhook;
	if (webhooks.exists(w => w.name === "GitHub Repo"))
		webhook = webhooks.find(w => w.name === "GitHub Repo");
	else webhook = await channel.createWebhook("GitHub Repo", "https://jfenn.me/images/ic/git.png");

	await githubRequest("repos/" + repo.full_name + "/hooks", 'POST', {
		name: "web",
		config: {
			url: "https://discordapp.com/api/webhooks/" + webhook.id + "/" + webhook.token + "/github",
			content_type: "json"
		},
		events: [
			"commit_comment",
			"create",
			"delete",
			"issue_comment",
			"issues",
			"page_build",
			"pull_request",
			"pull_request_review",
			"pull_request_review_comment",
			"push",
			"release"
		],
		active: true
	});
}

/**
 * Authenticates the sender of a message as a GitHub user, using
 * the passed login. This does not check that the sender owns the
 * passed GitHub login, nor does it check that the GitHub account
 * even exists; all it does is add the user to the database and
 * output any notices / error messages such as "User x has replaced
 * y as the owner of z", or "I can't find your member id, so you
 * probably aren't from the server this bot is used in".
 * 
 * @param message		The message sent by the user. This isn't
 * 						actually used for any more than obtaining
 * 						the author id and finding a channel to send
 * 						status messages in, so it could be faked
 * 						with something like `{ author: { id: "123" },
 * 						channel: channel }`.
 * @param userLogin		The GitHub login to authenticate the user as.
 */
async function authUser(message, userLogin) {
	await log(message.author.username + " has been authed as " + userLogin);

	if (_params.githubUsers[userLogin])
		await message.channel.send("<@" + message.author.id + "> has replaced <@" + _params.githubUsers[userLogin] + "> as the "
				+ "owner of <https://github.com/" + userLogin + ">.");
	else await message.channel.send("<@" + message.author.id + "> is authenticated as <https://github.com/" + userLogin + ">.");
					
	_params.githubUsers[userLogin] = message.author.id;
	if (_params.writeGithubUsers)
		_params.writeGithubUsers(_params.githubUsers);
	else console.error("Unimplemented method: writeGithubUsers(users)");

	let authRole = _guild.roles.find(r => r.name == "github-auth");
	let authMember = _guild.members.find(m => m.user.id == message.author.id);
	if (authRole && authMember)
		await authMember.addRole(authRole.id).catch(console.error);
	else await message.channel.send("I was unable to verify that you are a member of the server this bot is from. @ the server mods if this continues to be an issue.");
}

/**
 * Logs a message. This will send it to the appropriate channel in the discord
 * server as well as output it in the console.
 */
async function log(message, type) {
	if (typeof message === 'string')
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
		_guild = _client.guilds.first();
		log("I'm back online!");
		
		log({ embed: {
			title: "Server Info",
			color: 0x4CAF50,
			fields: [
				{
					name: "Operating System",
					value: _os.type() + ", " + _os.release(),
				},
				{
					name: "User Info",
					value: _os.userInfo().username + "@" + _os.hostname() + "\n"
						+ "Uptime: " + _os.uptime() + " seconds"
				},
				{
					name: "Hardware",
					value: "CPU: " + _os.cpus()[0].model + "\n"
						+ "Memory: " + _os.freemem() + " bytes\n"
						+ "Network: " + Object.keys(_os.networkInterfaces())[0]
				}
			],
			timestamp: new Date()
		}});
	});

	_client.on('guildMemberAdd', async function(member) {
		const channel = member.guild.channels.find(c => c.name == "github-auth");
		if (channel) {
			await channel.send("Welcome to the server, <@" + member.id + ">! If you are contributing to one of these projects and/or would "
					+ "like to authenticate your GitHub account, PM me with the command `!github auth`. You can also type `!github help` to "
					+ "see all of the other things I can do.");
		}
	});

	_client.on('message', async function(message) {
		if (!_guild)
			_guild = message.guild; // the bot can only ever be in one server at a time, so this is probably okay
	
		if (message.content.startsWith("!github ")) {
			if (!_guild && message.channel.type == "dm") {
				await message.channel.send("Wow, you sure caught me at a bad time. I'm a little busy right now, maybe you could try again later?"); // wow rude
				return;
			}
		
			let messageParts = message.content.split(" ");

			if (messageParts[1] === "sync") { // synchronize project channels + webhooks with a user's github repository
				if (message.channel.type == "dm") {
					await message.channel.send("This command isn't supported in DMs.");
					return;
				}
		
				if (!message.member.hasPermission("ADMINISTRATOR")) {
					await message.channel.send("You don't have the necessary permissions to run this command.");
					return;
				}

				if (!messageParts[2] || !(messageParts[2].includes("/") ? isValidGithubString(messageParts[2].split("/")[0]) && isValidGithubString(messageParts[2].split("/")[1]) : isValidGithubString(messageParts[2]))) {
					await message.channel.send("Invalid syntax; the format is `!github sync <username> [category]`");
					return;
				}

				let categoryChannel = message.guild.channels.find(c => c.name.toLowerCase() == (messageParts[3] ? messageParts[3] : "projects"));

				if (messageParts[2].includes("/")) {
					await linkRepo(message, JSON.parse((await _request('GET', "https://api.github.com/repos/" + messageParts[2], {
						headers: { 
							"User-Agent": "fennifith",
							"Authorization": _params.token ? "token " + _params.token : null
						}
					})).getBody('utf8')), categoryChannel);
				} else {
					await message.channel.send("Syncing repositories with <https://github.com/" + messageParts[2] + ">...");
			
					let repos = await githubRequest("users/" + messageParts[2] + "/repos?per_page=10000");
					for (let i in repos) {
						if (!repos[i].fork && !repos[i].archived && repos[i].full_name.startsWith(messageParts[2]) && repos[i].description && !repos[i].description.startsWith("("))
							await linkRepo(message, repos[i], categoryChannel);
					}			
				}

				await message.channel.send("...finished");
			} else if (messageParts[1] == "auth") { // verify a user's github account and assign roles accordingly
				if (messageParts[3] && messageParts[3] == "gist") {			
					if (!messageParts[2] || !isValidGithubString(messageParts[2])) {
						await message.channel.send("Invalid syntax; the format is `!github auth <token>` or `!github auth <username> <type>`.");
						return;
					}

					messageParts[2] = messageParts[2].toLowerCase();
					if (_params.githubUsers[messageParts[2]] == message.author.id) {
						await message.channel.send("<@" + message.author.id + ">, you are already authenticated as <https://github.com/" + messageParts[2] + ">.");
						return;
					}
				
					let gists = await githubRequest("users/" + messageParts[2] + "/gists?per_page=1000");
					if (!gists) {
						await message.channel.send("I can't find that username on GitHub. That or their servers are down. Check <https://status.github.com/> maybe?");
						return;
					}

					let gistPhrase = "Discord authentication (server: " + message.guild.name + ")";
					let githubPhrase = "I am " + messageParts[2] + " on GitHub";
					let discordPhrase = "I am " + message.author.username + " (" + message.author.id + ") on Discord";

					for (let i in gists) {
						if (gists[i].description.toLowerCase().includes(gistPhrase.toLowerCase())) {
							let file = (await _request('GET', gists[i].files[Object.keys(gists[i].files)[0]].raw_url, {
								headers: { 
									"User-Agent": "fennifith",
									"Authorization": _params.token ? "token " + _params.token : null
								}
							})).getBody('utf8').toLowerCase();

							if (file.includes(githubPhrase.toLowerCase()) && file.includes(discordPhrase.toLowerCase())) {
								authUser(message, messageParts[2]);
								return;
							}
						}
					}
				
					message.channel.send("<@" + message.author.id + "> I couldn't find a gist anywhere with your information. To verify your GitHub account, "
							+ "please create a public gist (https://gist.github.com/) with the description `" + gistPhrase + "` and file name `README.md`, "
							+ "and copy the following content into the file:\n```\n"
							+ "### " + gistPhrase + "\n\n"
							+ "I hereby claim:\n\n"
							+ "  * " + githubPhrase + ".\n"
							+ "  * " + discordPhrase + ".\n"
							+ "```\nthen run this command again.");
				} else {
					if (message.channel.type != "dm") {
						await message.channel.send("Please send me this command as a PM, as it contains instructions that should be kept private. You "
								+ "can send a PM by clicking on my profile image and typing in the message box that appears on desktop, or by pressing "
								+ "and holding on this message, selecting 'Profile' in the popup, and pressing the 'message' button in the bottom right "
								+ "on mobile.");

						return;
					}
				
					if (messageParts[2]) {
						let user = await _request('GET', "https://api.github.com/user", {
							headers: {
								"User-Agent": "fennifith",
								"Authorization": "token " + messageParts[2]
							}
						}).then(function(result) {
							return JSON.parse(result.getBody('utf8'));
						}).catch(function(error) {
							return null;
						});
												
						if (user && user.login) {
							authUser(message, user.login.toLowerCase());
							return;
						}
					}

					await message.channel.send("<@" + message.author.id + "> Please authenticate your GitHub account using the following URL, then run this command again with "
							+ "the token copied from the resulting page: <https://github.com/login/oauth/authorize?client_id=" + _params.client + ">");
				}
			} else if (messageParts[1] == "whois") { // output who a github user is on discord, or who a discord user is on github
				if (!messageParts[2]) {
					await message.channel.send("Invalid format; the format for this command is `whois <username>`.");
					return;
				}

				const reg = /<@(.*)>/;
				if (reg.test(messageParts[2])) {
					let discordId = reg.exec(messageParts[2])[1];
					let discordMember = _guild.members.find(m => m.user.id == discordId);
					
					let fields = [];
					for (let githubId in _params.githubUsers) {
						if (discordId == _params.githubUsers[githubId]) {
							let field = await getGithubUserField(githubId);
							if (field != null)
								fields.push(field);
						}
					}

					if (discordMember && fields.length > 0) {
						message.channel.send({ embed: {
							title: "@" + discordMember.user.username,
							fields: fields
						}});
					} else {
						message.channel.send("<@" + discordId + "> does not have any authenticated GitHub accounts; run `!github auth` to authenticate "
							+ "your account.");
					}
				} else if (isValidGithubString(messageParts[2])) {
					let githubId = messageParts[2];
					let discordId = _params.githubUsers[githubId];
					let discordMember = _guild.members.find(m => m.user.id == discordId);
					if (discordId && discordMember) {
						let field = await getGithubUserField(githubId);
						if (field) {
							await message.channel.send({ embed: {
								title: "@" + discordMember.user.username,
								fields: [ field ]
							}});

							return;
						}
					}
					
					await message.channel.send("<https://github.com/" + githubId + "> is not yet authenticated. Run the `!github auth` command to "
							+ "authenticate your account.");
				}
			} else if (messageParts[1] == "ls") {
				if (!_params.githubRepos[message.channel.id]) {
					message.channel.send("There doesn't seem to be a repository linked to this channel. Type `!github help` to see the full list of "
							+ "available commands.");
					return;
				}

				let repo = _params.githubRepos[message.channel.id];
		
				if (messageParts[2] == "contributors") {
					let contributors = JSON.parse((await _request('GET', "https://api.github.com/repos/" + repo + "/contributors", {
						headers: { 
							"User-Agent": "fennifith",
							"Authorization": _params.token ? "token " + _params.token : null
						}
					})).getBody('utf8'));

					let fields = [];
					for (let i in contributors) {
						let field = await getGithubUserField(contributors[i].login);
						if (field)
							fields.push(field);
					}
	
					await message.channel.send({ embed: {
						title: "Contributors to " + repo,
						url: "https://github.com/" + repo + "/graphs/contributors",
						fields: fields,
						timestamp: new Date()
					}});
					
					return;
				}
			
				await message.channel.send("Invalid syntax; the format is `!github ls <attribute>`.\n"
						+ "Valid attributes are: \"contributors\".")
			} else if (messageParts[1] == "restart") {
				let member = _guild.members.find(m => m.user.id == message.author.id);
				if (!member || !member.hasPermission("ADMINISTRATOR")) {
					await message.channel.send("You don't have the necessary permissions to run this command.");
					return;
				}

				await log("Restart requested; fetching latest git source...");
				process.exit();
			} else { //  display help message
				await message.channel.send({ embed: {
					title: "GitHub Thing Doer Commands",
					url: "https://jfenn.me/projects/discord-github-thing-doer",
					fields: [
						{
							name: "!github sync <user/repo> [category]",
							value: "Creates channels under [category], the first category with the name 'projects', or"
									+ "uncategorized (prioritized in that order) linked to the specified user's GitHub"
									+ "repos (or to the specified repo) via webhooks."
						},
						{
							name: "!github auth [token]",
							value: "Verifies a user's GitHub account and assigns the 'github-auth' role accordingly."
						},
						{
							name: "!github auth <username> gist",
							value: "Verifies a user's GitHub account and does the same as the normal 'auth' command, "
									+ "but verifies their account through the creation of a gist instead of using GitHub's "
									+ "OAuth APIs."
						},
						{
							name: "!github ls contributors",
							value: "Lists the contributors to the repository that the current channel is linked to, if any."
						},
						{
							name: "!github help",
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
