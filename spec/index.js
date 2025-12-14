const Mocha = require('mocha');
const fs = require('fs');
const path = require('path');
const runner = require('./runner');

const specModule = process.argv[2] || '';

let mocha = new Mocha();
let testDir = '.';

fs.readdirSync(testDir)
    .filter((file) => file.includes(specModule + '.spec.js'))
    .forEach((file) => {
        mocha.addFile(path.join(testDir, file));
    });

mocha.timeout(20000);

mocha.rootHooks({
    beforeAll: async function() {
        await runner.startApp();
    },
    afterAll: async function() {
        await runner.stopApp();
    }
});

mocha.run((failures) => {
    process.exitCode = failures ? 1 : 0;
});
