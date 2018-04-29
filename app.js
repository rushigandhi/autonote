const express = require('express');

const app = express();
const watson = require('watson-developer-cloud');

// Bootstrap application settings
require('./config/express')(app);

const stt = new watson.SpeechToTextV1({
  // if left undefined, username and password to fall back to the SPEECH_TO_TEXT_USERNAME and
  // SPEECH_TO_TEXT_PASSWORD environment properties, and then to VCAP_SERVICES (on Bluemix)
  // username: '',
  // password: ''
});

const authService = new watson.AuthorizationV1(stt.getCredentials());

app.get('/', (req, res) => {
  res.render('index', {
    bluemixAnalytics: !!process.env.BLUEMIX_ANALYTICS,
  });
});

// Get token using your credentials
app.get('/api/token', (req, res, next) => {
  authService.getToken((err, token) => {
    if (err) {
      next(err);
    } else {
      res.send(token);
    }
  });
});

module.exports = app;
