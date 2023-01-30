// Setup
const express = require('express');
const cors = require('cors');
const app = express();
const path = require('path');
const jsonfile = require('jsonfile');
var SpotifyWebApi = require('spotify-web-api-node');
const config = require('./server/config/config.json');

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
const mediaFile = './server/config/media.json';
const resumeFile = './server/config/resume.json';
const mupiboxconfigFile = './server/config/mupiboxconfig.json';

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, 'www'))); // Static path to compiled Ionic app


// Routes
app.get('/api/data', (req, res) => {
    jsonfile.readFile(activedataFile, (error, data) => {
        if (error) {
            data = [];
            console.log(error);
        }
        res.json(data);
    });
});

app.get('/api/network', (req, res) => {
    jsonfile.readFile(networkFile, (error, data) => {
        if (error) {
            data = [];
            console.log(error);
        }
        res.json(data);
    });
});

app.get('/api/wlan', (req, res) => {
    jsonfile.readFile(wlanFile, (error, data) => {
        if (error) {
            data = [];
            console.log(error);
        }
        res.json(data);
    });
});

app.post('/api/addwlan', (req, res) => {
    jsonfile.readFile(wlanFile, (error, data) => {
        if (error) {
            data = [];
            console.log(error);
        }
        data.push(req.body);

        jsonfile.writeFile(wlanFile, data, { spaces: 4 }, (error) => {
            if (error) throw err;
            res.status(200).send();
        });
    });
});

app.get('/api/media', (req, res) => {
    jsonfile.readFile(mediaFile, (error, data) => {
        if (error) {
            data = [];
            console.log(error);
        }
        res.json(data);
    });
});

app.post('/api/addmedia', (req, res) => {
    jsonfile.readFile(mediaFile, (error, data) => {
        if (error) {
            data = [];
            console.log(error);
            res.status(200).send('error');
        } else {
            data = req.body;

            jsonfile.writeFile(mediaFile, data, { spaces: 4 }, (error) => {
                if (error) throw err;
                res.status(200).send();
            });
        }
    });
});

app.get('/api/resume', (req, res) => {
    jsonfile.readFile(resumeFile, (error, data) => {
        if (error) {
            data = [];
            console.log(error);
        }
        res.json(data);
    });
});

app.post('/api/addresume', (req, res) => {
    jsonfile.readFile(resumeFile, (error, data) => {
        if (error) {
            data = [];
            console.log(error);
            res.status(200).send('error');
        } else {
            data = req.body;

            jsonfile.writeFile(resumeFile, data, { spaces: 4 }, (error) => {
                if (error) throw err;
                res.status(200).send();
            });
        }
    });
});

app.post('/api/add', (req, res) => {
    jsonfile.readFile(dataFile, (error, data) => {
        if (error) {
            data = [];
            console.log(error);
            res.status(200).send('error');
        } else {
            data.push(req.body);

            jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
                if (error) throw err;
                res.status(200).send('error');
            });
        }
    });
});

app.post('/api/delete', (req, res) => {
    jsonfile.readFile(dataFile, (error, data) => {
        if (error) {
            data = [];
            console.log(error);
            res.status(200).send('error');
        } else {
            data.splice(req.body.index, 1);

            jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
                if (error) throw err;
                res.status(200).send();
            });
        }
    });
});

app.post('/api/edit', (req, res) => {
    jsonfile.readFile(dataFile, (error, data) => {
        if (error) {
            data = [];
            console.log(error);
            res.status(200).send('error');
        } else {
            data.splice(req.body.index, 1, req.body.data);

            jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
                if (error) throw err;
                res.status(200).send();
            });
        }
    });
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