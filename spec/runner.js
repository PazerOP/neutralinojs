const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Persistent runner (loaded lazily to avoid requiring 'ws' when not in persistent mode)
let persistentRunner = null;

// Mode flag - set by index.js
let usePersistentMode = false;

// Last output from persistent mode (for getOutput compatibility)
let lastPersistentOutput = '';
let lastPersistentExitCode = 0;

const SOURCE_TEMPLATE = `
{BEFORE_INIT_CODE}

Neutralino.init();

Neutralino.events.on("ready", async () => {
    await __init();
    {CODE}
});

async function __close(data = "", exitCode = 0) {
    if(data) {
        await Neutralino.filesystem.writeFile(NL_PATH + "/.tmp/output.txt", data);
    }
    await Neutralino.app.exit(exitCode);
}

async function __init() {
    try {
        await Neutralino.filesystem.createDirectory(NL_PATH + "/.tmp");
    }
    catch(err) {
        // ignore
    }
    setTimeout(async () => {
        await Neutralino.filesystem.writeFile(NL_PATH + "/.tmp/output.txt", 'NL_SP_MAXTIMT');
        await Neutralino.app.exit(1); // max timeout force exit
    }, 20000);
}
`;

const TMP_DIR = '../bin/.tmp';
const OUTPUT_FILE = '../bin/.tmp/output.txt';
const SOURCE_FILE = '../bin/resources/js/main_spec.js';

// Set the mode (called from index.js)
function setMode(persistent) {
    usePersistentMode = persistent;
    if (persistent && !persistentRunner) {
        persistentRunner = require('./persistent-runner');
    }
}

// Start the persistent app (called from mocha before hook)
async function startApp() {
    if (usePersistentMode && persistentRunner) {
        await persistentRunner.startApp();
    }
}

// Stop the persistent app (called from mocha after hook)
async function stopApp() {
    if (usePersistentMode && persistentRunner) {
        await persistentRunner.stopApp();
    }
}

// Run test code - works in both modes
// In persistent mode, this is async and must be awaited
// In legacy mode, this is sync (returns exit code directly)
async function run(code, options = {}) {
    if (usePersistentMode && persistentRunner && !options.args) {
        // Persistent mode - use WebSocket
        try {
            const result = await persistentRunner.run(code, options);

            // Handle fallback to old runner (when args are provided)
            if (result.getOutput) {
                lastPersistentOutput = result.getOutput();
                lastPersistentExitCode = result.exitCode;
                return result.exitCode;
            }

            lastPersistentOutput = result.result || '';
            lastPersistentExitCode = result.exitCode || 0;
            return lastPersistentExitCode;
        } catch (err) {
            if (err.error) {
                lastPersistentOutput = err.error;
                lastPersistentExitCode = err.exitCode || 1;
            } else {
                lastPersistentOutput = err.message || String(err);
                lastPersistentExitCode = 1;
            }
            return lastPersistentExitCode;
        }
    }

    // Legacy mode - spawn new process
    return runSync(code, options);
}

// Original synchronous run function
function runSync(code, options = {}) {
    cleanup();
    if(options.debug) {
        console.log('INFO: Preparing app source...');
    }
    fs.writeFileSync(SOURCE_FILE, makeAppSource(code, options.beforeInitCode));

    if(options.debug) {
        console.log('INFO: Running the app...');
    }
    let exitCode = 0;
    try {
        let command = makeCommand(options.args);
        if(options.debug) {
            console.log('INFO: Running command: ' + command);
        }
        execSync(command);
    }
    catch(err) {
        exitCode = err.status;
    }

    if(options.debug) {
        console.log('INFO: Test app was closed...');
    }
    return exitCode;
}

function getOutput() {
    if (usePersistentMode) {
        const output = lastPersistentOutput;
        lastPersistentOutput = '';
        return output;
    }

    let content = ''
    try {
        content = fs.readFileSync(OUTPUT_FILE, 'utf8');
    }
    catch (err) {
        // ignore
    }
    cleanup();
    return content;
}

function makeCommand(optArgs = '') {
    let command = `..${path.sep}bin${path.sep}neutralino-`;
    if(process.platform == 'linux') {
        command += 'linux_' + process.arch
    }
    else if(process.platform == 'darwin') {
        command += 'mac_' + process.arch
    }
    else if(process.platform == 'win32') {
        command += 'win_x64.exe'
    }
    command += ' --load-dir-res --window-exit-process-on-close ' +
        '--url=/index_spec.html --window-enable-inspector=false ' + optArgs;
    return command;
}

function makeAppSource(code, beforeInitCode = '') {
    return SOURCE_TEMPLATE
        .replace('{CODE}', code)
        .replace('{BEFORE_INIT_CODE}', beforeInitCode);
}

function cleanup() {
    try {
        fs.rmSync(TMP_DIR, { recursive: true });
        fs.unlinkSync(SOURCE_FILE);
    }
    catch(err) {
        // ignore
    }
}

function isPersistentMode() {
    return usePersistentMode;
}

module.exports = {
    run,
    getOutput,
    setMode,
    startApp,
    stopApp,
    isPersistentMode
}
