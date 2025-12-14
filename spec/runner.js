const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const persistentRunner = require('./persistent-runner');

// Last output from persistent mode (for getOutput compatibility)
let lastOutput = '';

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

// Start the persistent app (called from mocha before hook)
async function startApp() {
    await persistentRunner.startApp();
}

// Stop the persistent app (called from mocha after hook)
async function stopApp() {
    await persistentRunner.stopApp();
}

// Run test code
async function run(code, options = {}) {
    // Tests with custom args need a fresh process (can't change window state dynamically)
    if (options.args) {
        lastOutput = '';
        const exitCode = runWithArgs(code, options);
        lastOutput = readOutputFile();
        return exitCode;
    }

    // Normal tests use persistent WebSocket connection
    try {
        const result = await persistentRunner.run(code, options);
        lastOutput = result.result || '';
        return result.exitCode || 0;
    } catch (err) {
        lastOutput = err.error || err.message || String(err);
        return err.exitCode || 1;
    }
}

// Spawn a new process for tests that need custom args
function runWithArgs(code, options) {
    cleanup();
    fs.writeFileSync(SOURCE_FILE, makeAppSource(code, options.beforeInitCode));

    let exitCode = 0;
    try {
        execSync(makeCommand(options.args));
    } catch (err) {
        exitCode = err.status;
    }
    return exitCode;
}

function getOutput() {
    const output = lastOutput;
    lastOutput = '';
    return output;
}

function readOutputFile() {
    try {
        const content = fs.readFileSync(OUTPUT_FILE, 'utf8');
        cleanup();
        return content;
    } catch (err) {
        cleanup();
        return '';
    }
}

function makeCommand(optArgs = '') {
    let command = `..${path.sep}bin${path.sep}neutralino-`;
    if (process.platform == 'linux') {
        command += 'linux_' + process.arch;
    } else if (process.platform == 'darwin') {
        command += 'mac_' + process.arch;
    } else if (process.platform == 'win32') {
        command += 'win_x64.exe';
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
    } catch (err) {
        // ignore
    }
}

module.exports = {
    run,
    getOutput,
    startApp,
    stopApp
}
