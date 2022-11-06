import 'dotenv/config';
import express from 'express';
import { nameMapping } from './playerMapping.js'
import { VerifyDiscordRequest, DiscordRequest } from './utils.js';
import WebSocket from 'ws'

var lastS = null
var sessionId = -2

var wss = null
var identified = false
var rpgChannelId = -1
var guildMembers = []
var voiceStates = []
var rpgRunning = false
var forceRenameInChannel = "963235344545886269"

// Create an express app
const app = express();
// Parse request body and verifies incoming requests using discord-interactions package
app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));

var verboseRequests = true

function onError(ws, err) {
  console.error(`onError: ${err.message}`);
}

async function connectWS(){
  const GetGatewayEndpoint = `gateway`;
  var gatewayUrlObj = await DOGet(GetGatewayEndpoint)
  var gatewayUrl = gatewayUrlObj['url']
  console.log("Raw gateway: " + gatewayUrl)
  var fullGatewayUrl = gatewayUrl + "/?v=9&encoding=json"
  console.log("Full gateway: " + fullGatewayUrl)

  return startUpWS(fullGatewayUrl)
}

const OP = {
  OTHER: { "CODE": 0, "name": "OTHER" },
  HEARTBEAT: { "CODE": 1, "name": "HEARTBEAT" },
  IDENTIFY: { "CODE": 2, "name": "IDENTIFY" },
  GUILD_MEMBERS_CHUNK: { "CODE": 3, "name": "GUILD_MEMBERS_CHUNK" },

  GATEWAY_RESUME: { "CODE": 6, "name": "GATEWAY_RESUME" },

  REQUEST_GUILD_MEMBERS: { "CODE": 8, "name": "REQUEST_GUILD_MEMBERS" },
  HELLO: { "CODE": 10, "name": "HELLO" },
  HEARTBEAT_ACK: { "CODE": 11, "name": "HEARTBEAT_ACK" },

}

var ChannelType = {
  GUILD_VOICE: 2
}

function sendWS(msg, debug = false) {
  console.log("Send op: " + Object.values(OP).find(i => i.CODE == msg['op']).name)
  if (debug) {
    console.log("  " + JSON.stringify(msg))
  }
  wss.send(JSON.stringify(msg))
}

function SendOp1Heartbeat() {
  sendWS({
    "op": OP.HEARTBEAT.CODE,
    "d": lastS
  })
  lastHeartbeatSent = Date.now()
}

function SendOp2Identify() {
  var intents = 0b000011010000011
  sendWS({
    "op": OP.IDENTIFY.CODE,
    "d": {
      "token": process.env.DISCORD_TOKEN,
      "intents": intents,
      "properties": {
        "$os": "windows",
        "$browser": "own_code",
        "$device": "own_code"
      }
    }
  })
}

function SendOp6GatewayResume(sessionId, seqNum) {
  if(sessionId < 0) { console.log("During RESUME, will send negative sessionId: " + sessionId)}
  sendWS({
    "op": OP.GATEWAY_RESUME.CODE,
    "d": {
      "token": process.env.DISCORD_TOKEN,
      "session_id": sessionId,
      "seq": seqNum
    }
  })
}


function SendOp8RequestGuildMembers(guildId) {
  sendWS({
    "op": OP.REQUEST_GUILD_MEMBERS.CODE,
    "d": {
      "guild_id": guildId,
      "query": "",
      "limit": 0
    }
  })
}

async function DOGet(endpoint) {
  try {
    if(verboseRequests) console.log("GET: Will hit " + endpoint)
    const res = await DiscordRequest(endpoint, { method: 'GET' });
    if(verboseRequests) console.log("GET: Status: " + res.status)

    const data = await res.json();

    if (data) {
      return data
    }
  } catch (err) {
    console.error(err);
  }
}


async function DOPatch(endpoint, payload) {
  try {
    if(verboseRequests) console.log("PATCH: Will hit " + endpoint)
    const res = await DiscordRequest(endpoint, { method: 'PATCH', body: payload });
    if(verboseRequests) console.log("PATCH: Status: " + res.status)

    const data = await res.json();
    var headers = res.headers
    if(verboseRequests) console.log("PATCH: [" + endpoint + "] Rate Limit: " + headers.get('X-RateLimit-Remaining') + "/" + headers.get('X-RateLimit-Limit') + "  Reset after: " + headers.get('X-RateLimit-Reset-After'))

    if (data) {
      return data
    }
  } catch (err) {
    console.error(err);
  }
}

async function DOPost(endpoint, payload) {
  try {
    if(verboseRequests) console.log("POST: " + endpoint)
    const res = await DiscordRequest(endpoint, { method: 'POST', body: payload });

    const data = await res.json();
    var headers = res.headers
    if(verboseRequests) console.log("POST: [" + endpoint + "] Rate Limit: " + headers.get('X-RateLimit-Remaining') + "/" + headers.get('X-RateLimit-Limit') + "  Reset after: " + headers.get('X-RateLimit-Reset-After'))

    if (data) {
      return data
    }
  } catch (err) {
    console.error(err);
  }
}


async function DOPut(endpoint, payload) {
  try {
    if(verboseRequests) console.log("PUT: " + endpoint)
    var reqBody = { method: 'PUT' }
    if(payload != undefined){
      reqBody['body'] = payload
    }
    const res = await DiscordRequest(endpoint, reqBody);

    const data = await res.text();
    var headers = res.headers
    if(verboseRequests) console.log("PUT: [" + endpoint + "] Rate Limit: " + headers.get('X-RateLimit-Remaining') + "/" + headers.get('X-RateLimit-Limit') + "  Reset after: " + headers.get('X-RateLimit-Reset-After'))

    if (data) {
      return data
    }
  } catch (err) {
    console.error(err);
  }
}



function renameToRpgName(username, toRpgName, rpgPlayerMap) {
  var guildMember = guildMembers.find(m => m['user']['username'] == username)
  var rpgPlayer = rpgPlayerMap.find(r => r['username'] == username)
  var inVoiceChannel = voiceStates.find(vs => vs['user_id'] == guildMember['user']['id'])
  var expectedNick = toRpgName ? rpgPlayer['gamename'] : null
  var differentNickname = guildMember['nick'] != expectedNick
 console.log ({rpgPlayer , inVoiceChannel , differentNickname})
  if (rpgPlayer && inVoiceChannel && differentNickname) {
    var nicknamePayload = { 'nick': expectedNick }
    DOPatch(`/guilds/${process.env.GUILD_ID}/members/${guildMember['user']['id']}`, nicknamePayload)
  }
}

function reactEmojiFor(emoji, msgId, channelId) {
  var emoji = (emoji == "smile") ? "%F0%9F%98%80" : "%F0%9F%99%82"
  DOPut(`/channels/${channelId}/messages/${msgId}/reactions/${emoji}/@me`)
}

var lastHeartbeatSent = Date.now()
var lastHeartbeatAckReceived = lastHeartbeatSent + 1

function BeatHeart(){
  var receivedMinusSent = lastHeartbeatAckReceived - lastHeartbeatSent
  var receivedAckAfterLastHeartbeat = receivedMinusSent >= 0
  console.log("Will beat heart. receivedMinusSent: " + receivedMinusSent + "; Ok? " + receivedAckAfterLastHeartbeat)

  if(!receivedAckAfterLastHeartbeat){
    console.log("No heartbeat ack received after last heartbeat! Will attempt to reconnect")
    closeWS()
    connectWS()
    .then((newWss) => {wss = newWss})
    .then(() => {SendOp6GatewayResume(sessionId, lastS);})
  } else {
    SendOp1Heartbeat()
  }
}

async function onMessage(ws, data) {
  var d = JSON.parse(data)
  const op = d['op']
  const t = d['t']
  lastS = d['s']
  const payload = d['d']
  console.log("["+(new Date()).toLocaleTimeString(undefined, {hour12: false}) + "] OnMessage: " + op + " [" + t + "]")


  if (op == OP.HELLO.CODE) {
    const heartbeat_interval = payload['heartbeat_interval']

    SendOp2Identify()

    setTimeout(() => {
      SendOp1Heartbeat()

      setInterval(() => { BeatHeart() }, heartbeat_interval)
    }, 100 + 0 * (heartbeat_interval / 100 * Math.random()))

  } else if (op == OP.HEARTBEAT.CODE) {
    console.log('Heartbeat REQUEST received');
    SendOp1Heartbeat()
  } else if (op == OP.HEARTBEAT_ACK.CODE) {
    lastHeartbeatAckReceived = Date.now()
    console.log('Heartbeat ACK received');
  } else if (op == OP.OTHER.CODE) {

    if (t == 'VOICE_STATE_UPDATE') {
      console.log(JSON.stringify(payload))

      var username = payload['member']['user']['username']
      var user_id = payload['member']['user']['id']

      var isDisconnecting = payload['channel_id'] == null
      var connectingToForcedRenameChannel = (forceRenameInChannel == null) || (payload['channel_id'] == forceRenameInChannel)
      if (isDisconnecting) {
        renameToRpgName(username, false, nameMapping["main"])
        renameToRpgName(username, false, nameMapping["secondary"])
      }

      delete (payload['member'])
      delete (payload['guild_id'])
      payload['user_id'] = user_id

      console.log(payload)

      var currVoiceState = voiceStates.find(vs => vs['user_id'] == user_id)
      if (currVoiceState) {
        console.log(currVoiceState)

        console.log("Was connected! " + JSON.stringify(currVoiceState))
        if (payload['channel_id']) {
          // console.log("Event: Connected to channel " + payload['channel_id'])

          currVoiceState['channel_id'] = payload['channel_id']
        }
        else {
          console.log("Event: Disconnected from channel")
          voiceStates = voiceStates.filter(vs => vs['user_id'] != user_id)
        }
      } else {
        console.log("Was not connected")
        voiceStates.push(payload)
      }
      // console.log(voiceStates)
      if (!isDisconnecting && connectingToForcedRenameChannel) {
        renameToRpgName(username, rpgRunning, nameMapping["main"])
        renameToRpgName(username, false, nameMapping["secondary"])
      }

    } else if (t == 'MESSAGE_CREATE') {

      if (payload['content'] == ';;start-rpg') {
        console.log("" + payload)
        rpgRunning = true
        for (var i = 0; i < nameMapping["main"].length; i++) {
          renameToRpgName(nameMapping["main"][i]['username'], true, nameMapping["main"])
        }
        reactEmojiFor("smile", payload['id'], payload['channel_id'])
      } else if (payload['content'] == ';;stop-rpg') {
        for (var i = 0; i < nameMapping["main"].length; i++) {
          renameToRpgName(nameMapping["main"][i]['username'], false, nameMapping["main"])
        }
        rpgRunning = false
        reactEmojiFor("smile", payload['id'], payload['channel_id'])
      } else if (payload['content'] == ';;start-job') {
        rpgRunning = true
        for (var i = 0; i < nameMapping["secondary"].length; i++) {
          renameToRpgName(nameMapping["secondary"][i]['username'], true, nameMapping["secondary"])
        }
        reactEmojiFor("smile", payload['id'], payload['channel_id'])
      } else if (payload['content'] == ';;stop-job') {
        for (var i = 0; i < nameMapping["secondary"].length; i++) {
          renameToRpgName(nameMapping["secondary"][i]['username'], false, nameMapping["secondary"])
        }
        rpgRunning = false
        reactEmojiFor("smile", payload['id'], payload['channel_id'])
      } else if (payload['content'] == ';;force-channel') {
        forceRenameInChannel = "963235344545886269"
      } else if (payload['content'] == ';;test') {
        reactEmojiFor("smile", payload['id'], payload['channel_id'])
      }
      else if (payload['content'] == ';;unforce-channel') {
        forceRenameInChannel = null
      }
      else {
        console.log(`onMessage: ${data}`);
      }

    } else if (t == 'GUILD_MEMBERS_CHUNK') {
      console.log('Guild Members received');
      guildMembers = payload['members']
    } else if (t == 'GUILD_MEMBER_UPDATE') {
      for (var i = 0; i < guildMembers.length; i++) {
        if (guildMembers[i]['user']['id'] == payload['user']['id']) {
          guildMembers[i] = payload
          break;
        }
      }
    } else if (t == 'GUILD_CREATE') {
      console.log(`GUILD_CREATE: ${Object.keys(payload)}`);

      delete (payload.members)
      delete (payload.emojis)
      delete (payload.guild_hashes)
      delete (payload.channels)
      delete (payload.roles)
      //console.log(payload);
      voiceStates = payload['voice_states']
      console.log(voiceStates)


    } else {
      console.log(`onMessage: ${data}`);
    }
  } else if (t == 'READY') {
    sessionId = payload['session_id']
  } else {
    console.log(`onMessage: ${data}`);
  }
}



function startUpWS(addr) {
  const wss = new WebSocket(addr);

  wss.on('message', data => onMessage(wss, data));
  wss.on('error', error => onError(wss, error));

  console.log(`App Web Socket Server is running!`);
  return wss;
}

function closeWS(){
  console.log("Closing WS")
  wss.close()
}

async function initBot(appId, guildId) {
  var channels = await DOGet(`/guilds/${guildId}/channels`)

  console.log("Voice channels: \n  " + channels.filter((c) => c['type'] == ChannelType.GUILD_VOICE).map( c => c.name).join("\n  "))

  wss = await connectWS()

  setTimeout(() => {
    //Request guild members so we know who is online
    SendOp8RequestGuildMembers(guildId)
  }, 1000)
}

var server = app.listen(3000, () => {
  console.log('Listening on port 3000');
  initBot(process.env.APP_ID, process.env.GUILD_ID)
});
