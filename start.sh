#!/bin/bash
set -e

# This magical script is in charge of handling the node.js
# script which does the "actual" work, ensuring that the
# correct directories are used, and verifying that
# the environment is set up properly.
#
# The configuration variables should not be changed here; you
# should make another file in '/etc/discord-thing-doer.conf.sh'
# to overwrite them.

SOURCE_PATH='~/js/discord-github-thing-doer/'
GITHUB_CLIENT=''
GITHUB_TOKEN=''
TRAVIS_TOKEN=''
BINTRAY_LOGIN=''
BINTRAY_REPO=''
BINTRAY_KEY=''
DISCORD_GITHUB_TOKEN=''
DISCORD_TRAVIS_TOKEN=''

source /etc/discord-thing-doer.conf.sh && :

cd $SOURCE_PATH
git pull && :
rm -rf ./node_modules
npm install

node index.js --githubClient $GITHUB_CLIENT --githubToken $GITHUB_TOKEN \
	--travisToken $TRAVIS_TOKEN \
	--bintraySubject $BINTRAY_LOGIN --bintrayRepo $BINTRAY_REPO \
	--bintrayKey $BINTRAY_KEY \
	--discordGithubToken $DISCORD_GITHUB_TOKEN \
	--discordTravisToken $DISCORD_TRAVIS_TOKEN
