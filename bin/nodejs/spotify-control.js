const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config/config.json');
const log = require('console-log-level')({ level: config.server.logLevel });
const SpotifyWebApi = require('spotify-web-api-node');
const createPlayer = require('./../mplayer-wrapper');
const googleTTS = require('./../google-tts');
const fs = require('fs');
const childProcess = require("child_process");
const muPiBoxConfig = require('./config/mupiboxconfig.json');

  /*set up express router and set headers for cross origin requests*/
const app = express();
const server = http.createServer(app);
const player = createPlayer();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

  /*init spotify API */
let scopes = ['streaming', 'user-read-currently-playing', 'user-modify-playback-state', 'user-read-playback-state'];

let spotifyApi = new SpotifyWebApi({
    clientId: config.spotify.clientId,
    clientSecret: config.spotify.clientSecret,
    refreshToken: config.spotify.refreshToken,
});

 /*sets and refreshes access token every hour */
spotifyApi.setAccessToken(config.spotify.accessToken);
refreshToken("0");
setInterval(refreshToken, 1000 * 60 * 60);

  /*store device to be played back*/
let activeDevice = "";
var currentPlayer = '';
var playing = false;
var volumeStart = 99;
var	playerstate;

function writeplayerstatePlay(){
	playerstate = 'play';
	fs.writeFile('/tmp/playerstate', playerstate, err => {
		if (err) {
			console.error(err)
			return
		}
		log.debug("[Spotify Control] Write play to /tmp/playerstate");
	})
}

function writeplayerstatePause(){
	playerstate = 'pause';
	fs.writeFile('/tmp/playerstate', playerstate, err => {
		if (err) {
			console.error(err)
			return
		}
		log.debug("[Spotify Control] Write play to /tmp/playerstate");
	})
}

function refreshToken(activePlaylistId){
  spotifyApi.refreshAccessToken()
    .then(function(data) {
      log.debug('The access token has been refreshed!');
      spotifyApi.setAccessToken(data.body['access_token']);
      if (activePlaylistId.includes("spotify:") ){
        playMe(activePlaylistId);
      }
    }, function(err) {
      log.debug('Could not refresh access token', err);
    }
  );
}

/*called in all error cases*/
/*token expired and no_device error are handled explicitly*/
function handleSpotifyError(err, activePlaylistId){
  if (err.body.error.status == 401){
    log.debug("access token expired, refreshing...");
    refreshToken(activePlaylistId);
  }

  else if (err.toString().includes("NO_ACTIVE_DEVICE")) {
    log.debug("no active device, setting the first one found to active");
    setActiveDevice(activePlaylistId);
  }
  else {
    log.debug("an error occured: " + err)
  }
}

async function getActiveDevice(){
  await spotifyApi.getMyCurrentPlaybackState().
  then(function(data) {
    log.debug("[Spotify Control]Type:" + typeof(data.body.device.id));
    if (typeof(data.body.device.id) !== 'undefined'){
      activeDevice = "";
      log.debug("[Spotify Control]Current active device is undefined");
    } else {
      activeDevice = data.body.device.id;
    }
    activeDevice = data.body.device.id;
    log.debug("[Spotify Control]Current active device is " + activeDevice);
  }, function(err) {
    handleSpotifyError(err,"0");
  });
}

  /*queries all devices and transfers playback to the first one discovered*/
function setActiveDevice(activePlaylistId) {
  let activeDevice;
    /*find devices first and choose first one available*/
  spotifyApi.getMyDevices()
    .then(function(data) {
      let availableDevices = data.body.devices;
      activeDevice = availableDevices[0];
    }, function(err) {
      log.debug('[Spotify Control] Transfering error: ' + err)
      handleSpotifyError(err,"0");
    })
    .then(function(){       /*transfer to active device*/
      activeDevice.id = config.spotify.deviceId;
      spotifyApi.transferMyPlayback([activeDevice.id])
        .then(function() {
          log.debug('[Spotify Control] Transfering playback to ' + activeDevice.id);
          if (activePlaylistId.includes("spotify:")){
            playMe(activePlaylistId);
          }
        }, function(err) {
          handleSpotifyError(err,"0");
        }
      );
    });
}

function pause(){
  if (currentPlayer == "spotify"){
    spotifyApi.pause()
      .then(function() {
        log.debug('[Spotify Control] Playback paused');
		writeplayerstatePause();
      }, function(err) {
        handleSpotifyError(err,"0");
      });
  } else if (currentPlayer == "mplayer") {
    if (playing){
      player.playPause();
      playing = false;
	  writeplayerstatePause();
    }
  }
}

function stop(){
  if (currentPlayer == "spotify"){
    spotifyApi.pause()
      .then(function() {
        log.debug('[Spotify Control] Playback paused');
		writeplayerstatePause();
      }, function(err) {
        handleSpotifyError(err,"0");
      });
  } else if (currentPlayer == "mplayer") {
    player.close();
    playing = false;
	  writeplayerstatePause();
  }
}

function play(){
  if (currentPlayer == "spotify"){
    spotifyApi.play()
      .then(function() {
        log.debug('[Spotify Control] Playback started');
		writeplayerstatePlay();
      }, function(err) {
        handleSpotifyError(err,"0");
      });
  } else if (currentPlayer == "mplayer") {
    if (!(playing)){
      player.playPause();
      playing = true;
	  writeplayerstatePlay();
    }
  }
}

function next(){
  if (currentPlayer == "spotify"){
    spotifyApi.skipToNext()
      .then(function() {
        log.debug('[Spotify Control] Skip to next');
      }, function(err) {
        handleSpotifyError(err,"0");
      });
  } else if (currentPlayer == "mplayer") {
    player.next();
  }
}

function previous(){
  if (currentPlayer == "spotify"){
    spotifyApi.skipToPrevious()
      .then(function() {
        log.debug('[Spotify Control] Skip to previous');
      }, function(err) {
        handleSpotifyError(err,"0");
      });
  } else if (currentPlayer == "mplayer") {
    player.previous();
  }
}

function playMe(activePlaylistId){
  spotifyApi.play({ context_uri: activePlaylistId })
    .then(function(data){
      log.debug("[Spotify Control] Playback started");
	  writeplayerstatePlay();
    }, function(err){
      log.debug("[Spotify Control] Playback error" + err);
      handleSpotifyError(err, activePlaylistId);
    });
    spotifyApi.setVolume(volumeStart).then(function () {
      log.debug('[Spotify Control] Setting volume to '+ 99);
      }, function(err) {
      handleSpotifyError(err,"0");
    });
}

function playList(playedList){
  let playedTitel = playedList.split('album:').pop();
  playedTitelmod = decodeURI(playedTitel);
  //playedTitelmod = playedTitel.replace(/%20/g," ");
  log.debug("[Spotify Control] Starting playing:" + playedTitelmod);
  playing = true;
  writeplayerstatePlay();
  player.playList('/home/dietpi/MuPiBox/media/' + playedTitelmod + '/playlist.m3u');
  player.setVolume(volumeStart);
  log.debug('/home/dietpi/MuPiBox/media/' + playedTitelmod + '/playlist.m3u');
}

function playFile(playedFile){
  let playedTitel = playedFile + '.mp3';
  log.debug("[Spotify Control] Starting playing:" + playedTitel);
  playing = true;
  writeplayerstatePlay();
  player.play('/home/dietpi/MuPiBox/tts_files/' + playedTitel);
  player.setVolume(volumeStart);
  log.debug('/home/dietpi/MuPiBox/tts_files/' + playedTitel);
}

function playURL(playedURL){
  log.debug("[Spotify Control] Starting playing:" + playedURL);
  playing = true;
  writeplayerstatePlay();
  player.play(playedURL);
  player.setVolume(volumeStart);
  log.debug(playedURL);
}

  /*seek 30 secends back or forward*/
function seek(progress){
  let currentProgress = 0;
  let targetProgress = 0;
  if (currentPlayer == "spotify"){
    spotifyApi.getMyCurrentPlaybackState().
      then(function(data) {
        currentProgress = data.body.progress_ms;
        log.debug("[Spotify Control]Current progress for active device is " + currentProgress);
        if (progress) targetProgress = currentProgress+30000;
        else targetProgress = currentProgress-30000;
      })
      .then(function(){
        spotifyApi.seek(targetProgress).then(function () {
            log.debug('[Spotify Control] Setting progress to '+ targetProgress);
            }, function(err) {
            handleSpotifyError(err,"0");
          });
      }, function(err) {
        handleSpotifyError(err,"0");
      });
  } else if (currentPlayer == "mplayer") {
    if (progress) player.seek(+30);
    else player.seek(-30);
  }
}

function cmdCall(cmd){
  return new Promise(function (resolve, reject){
    childProcess.exec(cmd, function(error, standardOutput, standardError) {
      if (error) {
        log.debug("[Spotify Control]error " + error);
        reject();
        return;
      }
      if (standardError) {
        log.debug("[Spotify Control]StandardError " + standardError);
        reject(standardError);
        return;
      }
      log.debug("[Spotify Control]StandardOutput " + standardOutput);
      resolve(standardOutput);
    });
  });
}

  /*gets available devices, searches for the active one and returns its volume*/
async function setVolume(volume){
  let volumeUp = "/usr/bin/amixer sset Master 5%+";
  let volumeDown = "/usr/bin/amixer sset Master 5%-";

  if (volume) await cmdCall(volumeUp);
  else await cmdCall(volumeDown);
}

async function transferPlayback(id){
  await spotifyApi.transferMyPlayback([id], {"play": false})
    .then(function() {
      log.debug('[Spotify Control] Transfering playback to ' + id);
    }, function(err) {
      log.debug('[Spotify Control] Transfering playback error.');
      handleSpotifyError(err,"0");
    });
}

function downloadTTS(name){
  let namedl = name;
  log.debug('[Spotify Control] TTS Name: ' + namedl);
  googleTTS
  .getAudioBase64(namedl, { lang: 'de', slow: false })
  .then((base64) => {
    console.log({ base64 });
    const buffer = Buffer.from(base64, 'base64');
    let filename = '/home/dietpi/MuPiBox/tts_files/' + namedl +'.mp3';
    log.debug('[Spotify Control] TTS Filename: ' + filename);
    fs.writeFileSync(filename, buffer, { encoding: 'base64' });
    playFile(namedl);
  })
  .catch(console.error);
}

async function useSpotify(command){
  currentPlayer = "spotify";
    let dir = command.dir;
    let newdevice = dir.split('/')[1];
    /*await getActiveDevice();*/
    /*setActiveDevice();*/
    log.debug("[Spotify Control] device is " + activeDevice + " and new is " + newdevice);
      /*active device has changed, transfer playback*/
    if (newdevice != activeDevice){
      log.debug("[Spotify Control] device changed from " + activeDevice + " to " + newdevice);

        log.debug("[Spotify Control] device is " + activeDevice);
        await transferPlayback(newdevice);
        activeDevice = newdevice;
        log.debug("[Spotify Control] device is " + activeDevice);
    }
    else {
      log.debug("[Spotify Control] still same device, won't change: " + activeDevice);
    }

    playMe(command.name);
}

  /*endpoint to return all spotify connect devices on the network*/
  /*only used if sonos-kids-player is modified*/
app.get("/getDevices", function(req, res){
  spotifyApi.getMyDevices()
    .then(function(data) {
      let availableDevices = data.body.devices;
      log.debug("[Spotify Control] Getting available devices...");
      res.send(availableDevices);
    }, function(err) {
      handleSpotifyError(err,"0");
    });
});

  /*endpoint transfer a playback to a specific device*/
  /*only used if sonos-kids-player is modified*/
app.get("/setDevice", function(req, res){
  transferPlayback(req.query.id);
});

  /*endpoint to return all state information*/
  /*only used if sonos-kids-player is modified*/
app.get("/state", function(req, res){
  spotifyApi.getMyCurrentPlaybackState()
  .then(function(data) {
    let state = data.body;
    log.debug("[Spotify Control] Getting available state...");
    res.send(state);
  }, function(err) {
    handleSpotifyError(err,"0");
  });
});

/*endpoint to return all spotify connect devices on the network*/
/*only used if sonos-kids-player is modified*/
app.get("/currentlyPlaying", function(req, res){
  spotifyApi.getMyCurrentPlayingTrack()
    .then(function(data) {
      if (data.body.item != undefined){
        log.debug("[Spotify Control] Currently playing: " + data.body.item.name);
        res.send(data.body.item);
      }
      else {
        res.send({"status":"paused","error":"none"});
      }
    }, function(err) {
      handleSpotifyError(err,"0");
    });
});


  /*sonos-kids-controller sends commands via http get and uses path names for encoding*/
  /*commands are as defined in sonos-kids-controller and mapped spotify calls*/
app.use(function(req, res){
  let command = path.parse(req.url);
  log.debug("[Spotify Control]name: " + command.name);
  log.debug("[Spotify Control]dir: " + command.dir);
    /*this is the first command to be received. It always includes the device id encoded in between two /*/
    /*check this if we need to transfer the playback to a new device*/
  if(command.name.includes("spotify:") ){
    useSpotify(command);
  }

  if(command.dir.includes("library") ){
    currentPlayer = "mplayer";
    playList(command.name);
  }

  if(command.dir.includes("tunein") ){
    currentPlayer = "mplayer";
    let dir = command.dir;
    let radioURL = dir.split('tunein/').pop();
    radioURL = decodeURIComponent(radioURL);
    playURL(radioURL);
  }

  if(command.dir.includes("say/") ){
   let dir = command.dir;
   let nameTTS = dir.split('say/').pop();
   nameTTS = decodeURIComponent(nameTTS);
   log.debug("[Spotify Control] Say: " + nameTTS);
   let filename = '/home/dietpi/MuPiBox/tts_files/' + nameTTS +'.mp3';
   try {
      if(fs.existsSync(filename)) {
        console.log("The file exists.");
        playFile(nameTTS);
      } else {
        console.log('The file does not exist.');
        downloadTTS(nameTTS);
      }
    } catch (err) {
      console.error(err);
    }
  }


  else if (command.name == "pause")
    pause();

  else if (command.name == "play")
    play();

  else if (command.name == "stop")
    stop();

  else if (command.name == "next")
    next();

  else if (command.name == "previous")
    previous();

  else if (command.name == "+5")
    setVolume(1);

  else if (command.name == "-5")
    setVolume(0);

  else if (command.name == "seek+30")
    seek(1);

  else if (command.name == "seek-30")
    seek(0);

  let resp = {"status":"ok","error":"none"};
  res.send(resp);
});

server.listen(config.server.port, () => {
  log.debug("[Spotify Control] Webserver is running on port: " + config.server.port );
});
