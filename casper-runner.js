require('dotenv').config({ silent: true });

if (!process.env.SPEECH_TO_TEXT_USERNAME) {
  console.log('Skipping integration tests because SPEECH_TO_TEXT_USERNAME is null');
  process.exit(0);
}

const spawn = require('child_process').spawn;

const app = require('./app');

const port = 3000;

const server = app.listen(port, () => {
  console.log('Server running on port: %d', port);

  function kill(code) {
    server.close(() => {
      process.exit(code);
    });
  }

  function runTests() {
    const casper = spawn('npm', ['run', 'test-integration']);
    casper.stdout.pipe(process.stdout);

    casper.on('error', (error) => {
      console.error(`ERROR: ${error}`);
      server.close(() => {
        process.exit(1);
      });
    });

    casper.on('close', kill);
  }

  runTests();
});
