The `discord-github-thing-doer` is a WIP Discord bot that does github-related things. It is primarily for personal use, but I'm open-sourcing it because... why not. You can see it in action in the Discord server below.

[![Discord](https://img.shields.io/discord/514625116706177035.svg)](https://discord.gg/KPqbBjS)

| GitHub   | Travis   |
|----------|----------|
| ![GitHub Discord Logo](./.github/logo.png?raw=true) | ![Travis Discord Logo](./.github/travis-logo.png?raw=true) |

^ `github-thing-doer`'s awesome logo by [rjt](https://twitter.com/rjt_rockx) (Travis variant by me)

The program is split into two bot accounts, one for GitHub and one for Travis, that both share configuration files located in `~/.config/discord-github-thing-doer/*`.

## Commands

Several commands can be used to invoke the GitHub bot to perform various actions:

```
!github sync <user/repo> [category]			Creates channels under [category], the first category
											with the name 'projects', or 'uncategorized' (prioritized
											in that order) linked to a specified user's GitHub repos
											(or to the specified repo) via webhooks.

!github auth [token]						Verifies a user's GitHub account and assigns the 'github-auth'
											role accordingly.

!github auth <username> gist				Verifies a user's GitHub account and does the same as the normal
											'auth' command, but verifies their account through the creation of
											a gist instead of using GitHub's OAuth APIs.

!github ls contributors						Lists the contributors to the repository that the current channel
											is linked to, if any.

!github help								Displays this beautiful message.
```
