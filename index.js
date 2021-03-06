'use strict';

const _fs = require('fs');
const _path = require('path');
const _args = require('minimist')(process.argv.slice(2));
const _githubBot = require('./github.js');
const _travisBot = require('./travis.js');

const _githubUsersPath = _path.join(process.env.HOME, ".config/discord-github-thing-doer/users.json");
const _githubReposPath = _path.join(process.env.HOME, ".config/discord-github-thing-doer/repos.json");

const _githubUsers = _fs.existsSync(_githubUsersPath) ? JSON.parse(_fs.readFileSync(_githubUsersPath, "utf8")) : {};
const _githubRepos = _fs.existsSync(_githubReposPath) ? JSON.parse(_fs.readFileSync(_githubReposPath, "utf8")) : {};

async function writeGithubUsers(users) {
	let paths = _githubUsersPath.split("/");
	let path = [];
	for (let i = 0; i < paths.length - 1; i++) {
		path.push(paths[i]);

		let resolved = _path.resolve(path.join("/"));
		if (!_fs.existsSync(resolved))
			_fs.mkdirSync(resolved);
	}

	_fs.writeFileSync(_path.resolve(_githubUsersPath), JSON.stringify(users));
}

async function writeGithubRepos(repos) {
	let paths = _githubReposPath.split("/");
	let path = [];
	for (let i = 0; i < paths.length - 1; i++) {
		path.push(paths[i]);

		let resolved = _path.resolve(path.join("/"));
		if (!_fs.existsSync(resolved))
			_fs.mkdirSync(resolved);
	}

	_fs.writeFileSync(_path.resolve(_githubReposPath), JSON.stringify(repos));
}

_githubBot.start({
	client: _args.githubClient,
	token: _args.githubToken,
	githubUsers: _githubUsers,
	githubRepos: _githubRepos,
	writeGithubUsers: writeGithubUsers,
	writeGithubRepos: writeGithubRepos,
	bot: _args.discordGithubToken
});

_travisBot.start({
	client: _args.githubClient,
	token: _args.githubToken,
	travisToken: _args.travisToken,
	bintraySubject: _args.bintraySubject,
	bintrayRepo: _args.bintrayRepo,
	bintrayKey: _args.bintrayKey,
	githubUsers: _githubUsers,
	githubRepos: _githubRepos,
	bot: _args.discordTravisToken
});
