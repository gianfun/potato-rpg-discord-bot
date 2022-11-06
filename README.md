# Potato RPG Discord bot

This project contains a Discord app for helping my group of friends with RPG related things. Mainly mass-renaming players into their in-game names and back.

It was based off the rock-paper-scissors-style [tutorial app repository](https://github.com/discord/discord-example-app) from the [getting started guide](https://discord.com/developers/docs/getting-started).

## Project structure
Below is a basic overview of the project structure:

```
├── .env.sample -> sample .env file
├── app.js      -> main entrypoint for app
├── utils.js    -> utility functions and enums
├── package.json
├── README.md
└── .gitignore
```

## Running app locally

Before you start, you'll need to [create a Discord app](https://discord.com/developers/applications) with the proper permissions:
- `applications.commands`
- `bot` (with Send Messages enabled)

Configuring the app is covered in detail in the [getting started guide](https://discord.com/developers/docs/getting-started).

### Setup project

First clone the project:
```
git clone https://github.com/gianfun/potato-rpg-discord-bot.git
```

Then navigate to its directory and install dependencies:
```
cd potato-rpg-discord-bot
npm install
```
### Get app credentials

Fetch the credentials from your app's settings and add them to a `.env` file (see `.env.sample` for an example). You'll need your app ID (`APP_ID`), server ID (`GUILD_ID`), bot token (`DISCORD_TOKEN`), and public key (`PUBLIC_KEY`).

Fetching credentials is covered in detail in the [getting started guide](https://discord.com/developers/docs/getting-started).

### Setup names

The 'playerMapping.js' file contains a map with the in-game names for each person. Seeing as the bot may be used for more than one group, it is possible to set different names (but it won't work concurrently)

### Run the app

After your credentials are added, go ahead and run the app:

```
node app.js
```

> ⚙️ A package [like `nodemon`](https://github.com/remy/nodemon), which watches for local changes and restarts your app, may be helpful while locally developing.

## Other resources
- Read **[the documentation](https://discord.com/developers/docs/intro)** for in-depth information about API features.
- Browse the `examples/` folder in this project for smaller, feature-specific code examples
- Join the **[Discord Developers server](https://discord.gg/discord-developers)** to ask questions about the API, attend events hosted by the Discord API team, and interact with other devs.
- Check out **[community resources](https://discord.com/developers/docs/topics/community-resources#community-resources)** for language-specific tools maintained by community members.
