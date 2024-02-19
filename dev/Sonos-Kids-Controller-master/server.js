// Setup
const express = require('express');
const cors = require('cors');
const app = express();
const path = require('path');
const jsonfile = require('jsonfile');
var SpotifyWebApi = require('spotify-web-api-node');
const config = require('./server/config/config.json');
const fs = require('fs');
const request = require('request');
const xmlparser = require('xml-js');

app.use(cors());

var spotifyApi = new SpotifyWebApi({
    clientId: config.spotify.clientId,
    clientSecret: config.spotify.clientSecret
});

// Configuration
const dataFile = './server/config/data.json';
const activedataFile = './server/config/active_data.json';
const networkFile = './server/config/network.json';
const wlanFile = './server/config/wlan.json';
const monitorFile = './server/config/monitor.json';
const albumstopFile = './server/config/albumstop.json';
const dataLock = '/tmp/.data.lock';

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, 'www'))); // Static path to compiled Ionic app


// Routes
app.get('/api/rssfeed', async (req, res) => {
    request.get(
      {
        url: req.query.url
      }
      , function (error, response, body) {
      res.send(xmlparser.xml2json( response.body ,  {compact: true, nativeType: true}) )
    });
});

app.get('/api/data', (req, res) => {
    jsonfile.readFile(activedataFile, (error, data) => {
        if (error) {
            data = [];
            console.log("[Sonos-Server] Error /api/data read active_data.json");
            console.log(error);
        }
        res.json(data);
    });
});

app.get('/api/network', (req, res) => {
    if (fs.existsSync(networkFile)){
        jsonfile.readFile(networkFile, (error, data) => {
            if (error) {
                data = [];
                console.log("[Sonos-Server] Error /api/network read network.json");
                console.log(error);
            }
            res.json(data);
        });
    }
});

app.get('/api/monitor', (req, res) => {
    if (fs.existsSync(monitorFile)){
        jsonfile.readFile(monitorFile, (error, data) => {
            if (error) {
                data = [];
                console.log("[Sonos-Server] Error /api/monitor read monitor.json");
                console.log(error);
            }
            res.json(data);
        });
    }
});

app.get('/api/albumstop', (req, res) => {
    if (fs.existsSync(albumstopFile)){
        jsonfile.readFile(albumstopFile, (error, data) => {
            if (error) {
                data = [];
                console.log("[Sonos-Server] Error /api/albumstop read albumstop.json");
                console.log(error);
            }
            res.json(data);
        });
    }
});

app.get('/api/wlan', (req, res) => {
    if (fs.existsSync(wlanFile)){
        jsonfile.readFile(wlanFile, (error, data) => {
            if (error) {
                data = [];
                console.log("[Sonos-Server] Error /api/wlan read wlan.json");
                console.log(error);
            }
            res.json(data);
        });
    }
});

app.post('/api/addwlan', (req, res) => {
    jsonfile.readFile(wlanFile, (error, data) => {
        if (error) data = [];
        data.push(req.body);

        jsonfile.writeFile(wlanFile, data, { spaces: 4 }, (error) => {
            if (error) throw err;
            res.status(200).send('ok');
        });
    });
});

app.post('/api/add', (req, res) => {
    try {
        if (fs.existsSync(dataLock)) {
            console.log("[Sonos-Server] /api/add data.json locked");
            res.status(200).send('locked');
        } else {
            fs.openSync(dataLock, 'w');
            jsonfile.readFile(dataFile, (error, data) => {
                if (error) {
                    data = [];
                    console.log("[Sonos-Server] Error /api/add read data.json");
                    console.log(error);
                    res.status(200).send('error');
                } else {
                    data.push(req.body);
        
                    jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
                        if (error) throw err;
                        res.status(200).send('ok');
                    });
                }
            });
            fs.unlink(dataLock, function (err) {
                if (err) throw err;
                console.log('[Sonos-Server] data.json unlocked, locked file deleted!');
              });
        }
    } catch(err) {
      console.error(err)
    }
});

app.post('/api/delete', (req, res) => {
    try {
        if (fs.existsSync(dataLock)) {
            console.log("[Sonos-Server] /api/delete data.json locked");
            res.status(200).send('locked');
        } else {
            fs.openSync(dataLock, 'w');
            jsonfile.readFile(dataFile, (error, data) => {
                if (error) {
                    data = [];
                    console.log("[Sonos-Server] Error /api/delete read data.json");
                    console.log(error);
                    res.status(200).send('error');
                } else {
                    data.splice(req.body.index, 1);
        
                    jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
                        if (error) throw err;
                        res.status(200).send('ok');
                    });
                }
            });
            fs.unlink(dataLock, function (err) {
                if (err) throw err;
                console.log('[Sonos-Server] data.json unlocked, locked file deleted!');
              });
        }
    } catch(err) {
      console.error(err)
    }
});

app.post('/api/edit', (req, res) => {
    try {
        if (fs.existsSync(dataLock)) {
            console.log("[Sonos-Server] /api/edit data.json locked");
            res.status(200).send('locked');
        } else {
            fs.openSync(dataLock, 'w');
            jsonfile.readFile(dataFile, (error, data) => {
                if (error) {
                    data = [];
                    console.log("[Sonos-Server] Error /api/edit read data.json");
                    console.log(error);
                    res.status(200).send('error');
                } else {
                    data.splice(req.body.index, 1, req.body.data);
        
                    jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
                        if (error) throw err;
                        res.status(200).send('ok');
                    });
                }
            });
            fs.unlink(dataLock, function (err) {
                if (err) throw err;
                console.log('[Sonos-Server] data.json unlocked, locked file deleted!');
              });
        }
    } catch(err) {
      console.error(err)
    }
});

app.get('/api/token', (req, res) => {
    // Retrieve an access token from Spotify
    spotifyApi.clientCredentialsGrant().then(
        function(data) {
            res.status(200).send(data.body['access_token']);
        },
        function(err) {
            console.log(
                'Something went wrong when retrieving a new Spotify access token',
                err.message
            );

            res.status(500).send(err.message);
        }
    );
});

app.get('/api/sonos', (req, res) => {
    // Send server address and port of the node-sonos-http-api instance to the client
    res.status(200).send(config['node-sonos-http-api']);
});

// Catch all other routes and return the index file from Ionic app
//app.get('*', (req, res) => {
//    res.sendFile(path.join(__dirname, 'www/index.html'));
//});

// listen (start app with 'node server.js')
app.listen(8200);
console.log("App listening on port 8200");