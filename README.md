The `discord-github-thing-doer` is a WIP Discord bot that does github-related things. It is primarily for personal use, but I'm open-sourcing it because... why not. You can see it in action in the Discord server below.

[![Discord](https://img.shields.io/discord/514625116706177035.svg)](https://discord.gg/KPqbBjS)

| GitHub   | Travis   |
|----------|----------|
| ![GitHub Discord Logo](./.github/logo.png?raw=true) | ![Travis Discord Logo](./.github/travis-logo.png?raw=true) |

^ `github-thing-doer`'s awesome logo by [rjt](https://twitter.com/rjt_rockx) (Travis variant by me)

## Usage

The program is split into two bot accounts, one for GitHub and one for Travis, that both share configuration files located in `~/.config/discord-github-thing-doer/*`. Despite being written independently, in terms of functionality the Travis module is seen as a sort of "plugin" for the GitHub bot; most of the Travis functionality requires the GitHub bot to already be set up. As such, the GitHub bot is also in charge of handling general functionality such as ending the process if the `restart` command is sent.

Several commands can be used to invoke the GitHub bot to perform various actions:

```
!github sync <user/repo> [category]	Creates channels under [category], the first category
					with the name 'projects', or 'uncategorized' (prioritized
					in that order) linked to a specified user's GitHub repos
					(or to the specified repo) via webhooks.

!github auth [token]			Verifies a user's GitHub account and assigns the 'github-auth'
					role accordingly.

!github auth <username> gist		Verifies a user's GitHub account and does the same as the normal
					'auth' command, but verifies their account through the creation of
					a gist instead of using GitHub's OAuth APIs.

!github whois <user>			Outputs the user's verified identity, if any; passing an @mention
					or GitHub login should both result in the same output.

!github ls contributors			Lists the contributors to the repository that the current channel
					is linked to, if any.

!github help				Displays this beautiful message.
```

The Travis bot responds to a few commands as well:

```
!travis sync				Creates a webhook for Travis deployments in each channel that
					is linked to a GitHub repository; `!github sync` must be run
					before this is used. The webhook URL will be set as the
					'DISCORD_WEBHOOK' environment variable in Travis for each
					repository.

!travis help				Displays this beautiful message.
```

And finally, 

```
!thing-doer server			Output information about the server, such as the CPU, current user,
					uptime, memory, etc.

!thing-doer restart			Ends the process that the bot is running on; particularly useful
					if the bot is run in a loop of `git pull; npm install; node index.js`
					so it can be restarted to pull the latest source code automatically.

!thing-doer help			Displays this beautiful message.
```
