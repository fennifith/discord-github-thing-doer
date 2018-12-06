'use strict';

const _fs = require('fs');
const _path = require('path');
const _request = require('then-request');
const _discord = require('discord.js');
const _client = new _discord.Client();

var _guild;

function isValidGithubString(str) {
	return (/^[0-9A-Za-z\-_]+$/g).test(str);
}

async function linkRepo(params, message, repo, category) {
	let name = repo.name.toLowerCase().replace(/[._]/g, '-');
	console.log("Linking " + repo.full_name + " -> #" + name);
				
	let channel;
	if (_guild.channels.exists(c => c.name === name)) {
		channel = _guild.channels.find(c => c.name === name);
	} else {
		channel = await _guild.createChannel(name, "text");
		await message.channel.send("New project: <https://github.com/" + repo.full_name + "> -> <#" + channel.id + ">");
	}

	params.githubRepos[channel.id] = repo.full_name;
	if (params.writeGithubRepos)
		params.writeGithubRepos(params.githubRepos);
		//TODO: warn against undefined method

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
					
	_request('POST', "https://api.github.com/repos/" + repo.full_name + "/hooks", {
		headers: { 
			"User-Agent": "fennifith",
			"Authorization": params.token ? "token " + params.token : null
		},
		json: {
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
		}
	});
}

async function authUser(params, message, userLogin) {
	console.log(message.author.username + " has been authed as " + userLogin);

	if (params.githubUsers[userLogin])
		await message.channel.send("<@" + message.author.id + "> has replaced <@" + params.githubUsers[userLogin] + "> as the "
				+ "owner of <https://github.com/" + userLogin + ">.");
	else await message.channel.send("<@" + message.author.id + "> is authenticated as <https://github.com/" + userLogin + ">.");
					
	params.githubUsers[userLogin] = message.author.id;
	if (params.writeGithubUsers)
		params.writeGithubUsers(params.githubUsers);
		//TODO: warn against undefined method

	let authRole = _guild.roles.find(r => r.name == "github-auth");
	let authMember = _guild.members.find(m => m.user.id == message.author.id);
	if (authRole && authMember)
		await authMember.addRole(authRole.id).catch(console.error);
	else await message.channel.send("I was unable to verify that you are a member of the server this bot is from. @ the server mods if this continues to be an issue.");
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
	params = params || {};

	_client.on('ready', () => {
		console.log('Logged in as ' + _client.user.tag);
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
			_guild = message.guild; // the bot can only ever be in one server at a time, so this is okay
	
		if (message.content.startsWith("!github ")) {
			if (!_guild && message.channel.type == "dm") {
				await message.channel.send("Wow, you sure caught me at a bad time. I'm a little busy right now, maybe you could try again later?");
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
					await linkRepo(params, message, JSON.parse((await _request('GET', "https://api.github.com/repos/" + messageParts[2], {
						headers: { 
							"User-Agent": "fennifith",
							"Authorization": params.token ? "token " + params.token : null
						}
					})).getBody('utf8')), categoryChannel);
				} else {
					await message.channel.send("Syncing repositories with <https://github.com/" + messageParts[2] + ">...");
			
					let repos = JSON.parse((await _request('GET', "https://api.github.com/users/" + messageParts[2] + "/repos?per_page=10000", {
						headers: { 
							"User-Agent": "fennifith",
							"Authorization": params.token ? "token " + params.token : null
						}
					})).getBody('utf8'));
		
					for (let i = 0; i < repos.length; i++) {
						if (!repos[i].fork && !repos[i].archived && repos[i].full_name.startsWith(messageParts[2]) && repos[i].description && !repos[i].description.startsWith("("))
							await linkRepo(params, message, repos[i], categoryChannel);
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
					if (params.githubUsers[messageParts[2]] == message.author.id) {
						await message.channel.send("<@" + message.author.id + ">, you are already authenticated as <https://github.com/" + messageParts[2] + ">.");
						return;
					}
				
					let gists = await _request('GET', "https://api.github.com/users/" + messageParts[2] + "/gists?per_page=1000", {
						headers: { 
							"User-Agent": "fennifith",
							"Authorization": params.token ? "token " + params.token : null
						}
					}).then(function(result) {
						return JSON.parse(result.getBody('utf8'))
					}).catch(async function(err) {
						await message.channel.send("I can't find that username on GitHub. That or their servers are down. Check <https://status.github.com/> maybe?");
						return null;
					});

					if (!gists)
						return;

					let gistPhrase = "Discord authentication (server: " + message.guild.name + ")";
					let githubPhrase = "I am " + messageParts[2] + " on GitHub";
					let discordPhrase = "I am " + message.author.username + " (" + message.author.id + ") on Discord";

					for (let i in gists) {
						if (gists[i].description.toLowerCase().includes(gistPhrase.toLowerCase())) {
							let file = (await _request('GET', gists[i].files[Object.keys(gists[i].files)[0]].raw_url, {
								headers: { 
									"User-Agent": "fennifith",
									"Authorization": params.token ? "token " + params.token : null
								}
							})).getBody('utf8').toLowerCase();

							if (file.includes(githubPhrase.toLowerCase()) && file.includes(discordPhrase.toLowerCase())) {
								authUser(params, message, messageParts[2]);
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
							authUser(params, message, user.login.toLowerCase());
							return;
						}
					}

					await message.channel.send("<@" + message.author.id + "> Please authenticate your GitHub account using the following URL, then run this command again with "
							+ "the token copied from the resulting page: <https://github.com/login/oauth/authorize?client_id=" + params.client + ">");
				}
			} else if (messageParts[1] == "ls") {
				if (!params.githubRepos[message.channel.id]) {
					message.channel.send("There doesn't seem to be a repository linked to this channel. Type `!github help` to see the full list of "
							+ "available commands.");
					return;
				}

				let repo = params.githubRepos[message.channel.id];
				console.log("Command issued from " + repo);
		
				if (messageParts[2] == "contributors") {
					let contributors = JSON.parse((await _request('GET', "https://api.github.com/repos/" + repo + "/contributors", {
						headers: { 
							"User-Agent": "fennifith",
							"Authorization": params.token ? "token " + params.token : null
						}
					})).getBody('utf8'));

					let fields = [];
					for (let i in contributors) {
						let contributor = JSON.parse((await _request('GET', "https://api.github.com/users/" + contributors[i].login, {
							headers: { 
								"User-Agent": "fennifith",
								"Authorization": params.token ? "token " + params.token : null
							}
						})).getBody('utf8'));

						let text = " | [GitHub](" + contributor.html_url + ")";
						if (contributor.blog && contributor.blog.length > 0)
							text += " | [Website](" + contributor.blog + ")";
				
						if (params.githubUsers[contributor.login])
							text = "<@" + params.githubUsers[contributor.login] + ">" + text;
						else text = "@" + contributor.login + " (Not authenticated)" + text;

						fields.push({
							name: contributor.name && contributor.name.length > 0 ? contributor.name : contributor.login,
							value: text
						});
					}
	
					await message.channel.send({ embed: {
						title: "Contributors to " + repo,
						url: "https://github.com/" + repo + "/graphs/contributors",
						fields: fields,
						timestamp: new Date()
					}});
					return;
				} else if (messageParts[2] == "collaborators") {
					return;
				} else if (messageParts[2] == "issues") {
					return;
				}
			
				await message.channel.send("Invalid syntax; the format is `!github ls <attribute>`.\n"
						+ "Valid attributes are \"contributors\", \"collaborators\", or \"issues\".")
			} else { //  display help message
				message.channel.send("GitHub Thing Doer:\n"
					+ "This bot is written and maintained by James Fenn (@fennifith). Commands are as follows:\n"
					+ "```\n"
					+ "Usage: !github [command]\n\n"
					+ "Commands:\n"
					+ "sync <user/repo> [category]     Creates channels under [category], the\n"
					+ "                                first category with the name \"projects\",\n"
					+ "                                or uncategorized (prioritized in that order)\n"
					+ "                                linked to the specified user's GitHub\n"
					+ "                                repos (or the specified repo) via webhooks.\n"
					+ "auth                            Verifies a user's GitHub account and assigns\n"
					+ "                                the \"github-auth\" and \"contributor\" roles\n"
					+ "                                accordingly.\n"
					+ "auth <username> gist            Verifies a user's github account and does the\n"
					+ "                                same as the 'auth' command, but verifies their\n"
					+ "                                account through the creation of a gist."
					+ "ls <attribute>                  Lists attributes of the repository that the\n"
					+ "                                current channel is linked to, including\n"
					+ "                                \"contributors\", \"collaborators\", or\n"
					+ "                                \"issues\".\n"
					+ "help                            Displays this beautiful message.\n"
					+ "```");
			}
		}
	});

	_client.login(params.bot);
}

module.exports.start = start;
