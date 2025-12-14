const Mocha = require('mocha');
const fs = require('fs');
const path = require('path');
const runner = require('./runner');

// Parse arguments
const args = process.argv.slice(2);
const persistentMode = args.includes('--persistent');
const specModule = args.find(arg => !arg.startsWith('--')) || '';

// Set runner mode
runner.setMode(persistentMode);

if (persistentMode) {
    console.log('Running in persistent mode (single process for all tests)');
}

let mocha = new Mocha();
let testDir = '.';

// Add spec files
fs.readdirSync(testDir).filter((file) => file.includes(specModule + '.spec.js'))
.forEach((file) => {
    mocha.addFile(path.join(testDir, file));
});

mocha.timeout(20000);

// In persistent mode, use root hooks to start/stop the app
if (persistentMode) {
    mocha.rootHooks({
        beforeAll: async function() {
            console.log('Starting persistent Neutralino process...');
            await runner.startApp();
            console.log('Persistent process ready');
        },
        afterAll: async function() {
            console.log('Stopping persistent Neutralino process...');
            await runner.stopApp();
            console.log('Persistent process stopped');
        }
    });
}

mocha.run((failures) => {
    process.exitCode = failures ? 1 : 0;
});
