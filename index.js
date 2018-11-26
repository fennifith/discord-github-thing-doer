'use strict';

const _fs = require('fs');
const _path = require('path');
const _request = require('then-request');
const _args = require('minimist')(process.argv.slice(2));
const _discord = require('discord.js');
const _client = new _discord.Client();

const _token = _args.g;

const _githubUsers = {};
const _githubUsersPath = _path.join(process.env.HOME, ".config/discord-github-thing-doer/users.csv");

(() => {
	if (_fs.existsSync(_githubUsersPath)) {
		let file = _fs.readFileSync(_githubUsersPath, "utf8");
		let users = file.split("\n");
		for (let i = 0; i < users.length; i++) {
			let parts = users[i].split(",");
			_githubUsers[parts[1]] = parts[0];
		}
	}
})();

async function writeGithubUsers() {
	let paths = _githubUsersPath.split("/");
	let path = [];
	for (let i = 0; i < paths.length - 1; i++) {
		path.push(paths[i]);

		let resolved = _path.resolve(path.join("/"));
		if (!_fs.existsSync(resolved))
			_fs.mkdirSync(resolved);
	}

	let file = "";
	for (let login in _githubUsers) {
		file += _githubUsers[login] + "," + login + "\n";
	}

	_fs.writeFileSync(_path.resolve(_githubUsersPath), file);
}

function isValidGithubString(str) {
	return (/^[A-Za-z\-_]+$/g).test(str);
}

async function linkRepo(message, repo, category) {
	let name = repo.name.toLowerCase().replace(/[._]/g, '-');
	console.log("Linking " + repo.full_name + " -> #" + name);
				
	let channel;
	if (message.guild.channels.exists(c => c.name === name)) {
		channel = message.guild.channels.find(c => c.name === name);
	} else {
		channel = await message.guild.createChannel(name, "text");
		await message.channel.send("New project: " + repo.full_name + " -> <#" + channel.id + ">");
	}

	if (category)
		await channel.setParent(category);
						
	await channel.setTopic(repo.description);
	
	let webhooks = await channel.fetchWebhooks();
	let webhook;
	if (webhooks.exists(w => w.name === "GitHub Repo"))
		webhook = webhooks.find(w => w.name === "GitHub Repo");
	else webhook = channel.createWebhook("GitHub Repo", "https://jfenn.me/images/ic/git.png");
					
	_request('POST', "https://api.github.com/repos/" + repo.full_name + "/hooks", {
		headers: { 
			"User-Agent": "fennifith",
			"Authorization": _token ? "token " + _token : null
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

_client.on('ready', () => {
	console.log('Logged in as ' + _client.user.tag);
});

_client.on('guildMemberAdd', async function(member) {
	const channel = member.guild.channels.find(c => c.name == "github-auth");
	if (channel) {
		await channel.send("Welcome to the server, <@" + member.id + ">! If you are contributing to one of these projects and/or would "
				+ "like to authenticate your GitHub account, respond with `!github auth <your github username>` in this channel. "
				+ "You can also type `!github help` to see all of the other things I can do.");
	}
});

_client.on('message', async function(message) {
	if (message.content.startsWith("!github ")) {
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
						"Authorization": _token ? "token " + _token : null
					}
				})).getBody('utf8')), categoryChannel);
			} else {
				await message.channel.send("Syncing repositories with https://github.com/" + messageParts[2]);
			
				let repos = JSON.parse((await _request('GET', "https://api.github.com/users/" + messageParts[2] + "/repos?per_page=10000", {
					headers: { 
						"User-Agent": "fennifith",
						"Authorization": _token ? "token " + _token : null
					}
				})).getBody('utf8'));
		
				for (let i = 0; i < repos.length; i++) {
					if (!repos[i].fork && !repos[i].archived && repos[i].full_name.startsWith(messageParts[2]) && repos[i].description && !repos[i].description.startsWith("("))
						await linkRepo(message, repos[i], categoryChannel);
				}			
			}

			await message.channel.send("...finished");
		} else if (messageParts[1] == "auth") { // verify a user's github account and assign roles accordingly
			if (message.channel.type == "dm") {
				await message.channel.send("This command isn't supported in DMs.");
				return;
			}
			
			if (!messageParts[2] || !isValidGithubString(messageParts[2])) {
				await message.channel.send("Invalid syntax; the format is `!github auth <username>`.");
				return;
			}

			messageParts[2] = messageParts[2].toLowerCase();
			if (_githubUsers[messageParts[2]] == message.member.id) {
				await message.channel.send("<@" + message.member.id + ">, you are already authenticated as https://github.com/" + messageParts[2]);
				return;
			}

			let gists = JSON.parse((await _request('GET', "https://api.github.com/users/" + messageParts[2] + "/gists?per_page=1000", {
				headers: { 
					"User-Agent": "fennifith",
					"Authorization": _token ? "token " + _token : null
				}
			}).catch(async function(err) {
				await message.channel.send("I can't find that username on GitHub. That or their servers are down. Check https://status.github.com/ maybe?");
			})).getBody('utf8'));

			let gistPhrase = "Discord authentication (server: " + message.guild.name + ")";
			let githubPhrase = "I am " + messageParts[2] + " on GitHub";
			let discordPhrase = "I am " + message.member.user.username + " (" + message.member.id + ") on Discord";

			for (let i = 0; i < gists.length; i++) {
				if (gists[i].description.toLowerCase().includes(gistPhrase.toLowerCase())) {
					let file = (await _request('GET', gists[i].files[Object.keys(gists[i].files)[0]].raw_url, {
						headers: { 
							"User-Agent": "fennifith",
							"Authorization": _token ? "token " + _token : null
						}
					})).getBody('utf8').toLowerCase();

					if (file.includes(githubPhrase.toLowerCase()) && file.includes(discordPhrase.toLowerCase())) {
						if (_githubUsers[messageParts[2]])
							await message.channel.send("<@" + message.member.id + "> has replaced <@" + _githubUsers[messageParts[2]] + "> as the "
									+ "owner of https://github.com/" + messageParts[2]);
						else await message.channel.send("<@" + message.member.id + "> is authenticated as https://github.com/" + messageParts[2]);
					
						_githubUsers[messageParts[2]] = message.member.id;
						writeGithubUsers();

						let authRole = message.guild.roles.find(r => r.name == "github-auth");
						if (authRole)
							await message.member.addRole(authRole.id);
						
						return;
					}
				}
			}

			message.channel.send("<@" + message.member.id + "> I couldn't find a gist anywhere with your information. To verify your GitHub account, "
					+ "please create a public gist (https://gist.github.com/) with the description `" + gistPhrase + "` and file name `README.md`, "
					+ "and copy the following content into the file:\n```\n"
					+ "### " + gistPhrase + "\n\n"
					+ "I hereby claim:\n\n"
					+ "  * " + githubPhrase + ".\n"
					+ "  * " + discordPhrase + ".\n"
					+ "```\nthen run this command again.");
		} else if (messageParts[1] == "ls") {
			if (messageParts[2] == "contributors") {
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
				+ "auth <username>                 Verifies a user's GitHub account and assigns\n"
				+ "                                the \"github-auth\" and \"contributor\" roles\n"
				+ "                                accordingly.\n"
				+ "ls <attribute>                  Lists attributes of the repository that the\n"
				+ "                                current channel is linked to, including\n"
				+ "                                \"contributors\", \"collaborators\", or\n"
				+ "                                \"issues\".\n"
				+ "help                            Displays this beautiful message.\n"
				+ "```");
		}
	}
});

_client.login(_args.t);
