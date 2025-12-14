const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// State
let app = null;
let ws = null;
let authInfo = null;
let pendingTests = new Map();
let readyResolve = null;
let isReady = false;
let testIdCounter = 0;

// Paths
const BIN_DIR = path.join(__dirname, '..', 'bin');
const AUTH_INFO_PATH = path.join(BIN_DIR, '.tmp', 'auth_info.json');

function getBinaryPath() {
    let binaryName = 'neutralino-';
    if (process.platform === 'linux') {
        binaryName += 'linux_' + process.arch;
    } else if (process.platform === 'darwin') {
        binaryName += 'mac_' + process.arch;
    } else if (process.platform === 'win32') {
        binaryName += 'win_x64.exe';
    }
    return path.join(BIN_DIR, binaryName);
}

function waitForAuthInfo(timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const check = () => {
            if (fs.existsSync(AUTH_INFO_PATH)) {
                try {
                    const content = fs.readFileSync(AUTH_INFO_PATH, 'utf8');
                    const info = JSON.parse(content);
                    resolve(info);
                } catch (err) {
                    setTimeout(check, 50);
                }
            } else if (Date.now() - startTime > timeout) {
                reject(new Error('Timeout waiting for auth info'));
            } else {
                setTimeout(check, 50);
            }
        };
        check();
    });
}

async function startApp() {
    if (app) {
        return; // Already running
    }

    // Clean up any stale auth info
    try {
        fs.rmSync(path.join(BIN_DIR, '.tmp'), { recursive: true });
    } catch (err) {
        // Ignore
    }

    const binaryPath = getBinaryPath();
    const args = [
        '--load-dir-res',
        '--window-exit-process-on-close',
        '--url=/index_persistent_spec.html',
        '--window-enable-inspector=false',
        '--export-auth-info'
    ];

    app = spawn(binaryPath, args, {
        cwd: BIN_DIR,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    app.on('error', (err) => {
        console.error('Failed to start Neutralino:', err);
    });

    app.on('exit', (code) => {
        app = null;
        ws = null;
        isReady = false;
        authInfo = null;

        // Reject any pending tests
        for (const [id, { reject }] of pendingTests) {
            reject(new Error(`Process exited with code ${code}`));
        }
        pendingTests.clear();
    });

    // Wait for auth info file
    authInfo = await waitForAuthInfo();

    // Connect WebSocket
    const wsUrl = `ws://127.0.0.1:${authInfo.nlPort}?connectToken=${authInfo.nlConnectToken}`;

    return new Promise((resolve, reject) => {
        ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            // Wait for ready signal from client
            readyResolve = resolve;
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                handleMessage(message);
            } catch (err) {
                console.error('Failed to parse message:', err);
            }
        });

        ws.on('error', (err) => {
            reject(err);
        });

        ws.on('close', () => {
            ws = null;
            isReady = false;
        });

        // Timeout for connection
        setTimeout(() => {
            if (!isReady) {
                reject(new Error('Timeout waiting for WebSocket connection'));
            }
        }, 10000);
    });
}

function handleMessage(message) {
    if (message.event === 'testReady') {
        isReady = true;
        if (readyResolve) {
            readyResolve();
            readyResolve = null;
        }
    } else if (message.event === 'testResult') {
        const { id, result, error, exitCode } = message.data;
        const pending = pendingTests.get(id);
        if (pending) {
            pendingTests.delete(id);
            if (error) {
                pending.reject({ error, exitCode: exitCode || 1 });
            } else {
                pending.resolve({ result, exitCode: exitCode || 0 });
            }
        }
    }
}

function sendMessage(message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket not connected');
    }
    ws.send(JSON.stringify(message));
}

// Generate unique message ID
let msgIdCounter = 0;
function generateMsgId() {
    return `msg_${Date.now()}_${++msgIdCounter}`;
}

// Send an event broadcast via the Neutralino events.broadcast API
function broadcastEvent(eventName, eventData) {
    sendMessage({
        id: generateMsgId(),
        method: 'events.broadcast',
        accessToken: authInfo.nlToken,
        data: {
            event: eventName,
            data: eventData
        }
    });
}

async function run(code, options = {}) {
    // If custom args are provided, fall back to old runner
    // since we can't change window state dynamically
    if (options.args) {
        const oldRunner = require('./runner');
        return {
            exitCode: oldRunner.run(code, options),
            getOutput: () => oldRunner.getOutput()
        };
    }

    if (!isReady) {
        throw new Error('App not ready. Call startApp() first.');
    }

    const id = `test_${++testIdCounter}`;
    const beforeInitCode = options.beforeInitCode || '';

    return new Promise((resolve, reject) => {
        pendingTests.set(id, { resolve, reject });

        broadcastEvent('testExecute', {
            id,
            code,
            beforeInitCode
        });

        // Timeout for test execution
        setTimeout(() => {
            if (pendingTests.has(id)) {
                pendingTests.delete(id);
                reject(new Error('Test execution timeout'));
            }
        }, 19000); // Slightly less than mocha timeout
    });
}

async function stopApp() {
    if (!app) {
        return;
    }

    // Send exit command
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            sendMessage({
                id: 'exit',
                method: 'app.exit',
                accessToken: authInfo.nlToken,
                data: { exitCode: 0 }
            });
        } catch (err) {
            // Ignore
        }
    }

    // Wait for graceful shutdown
    await new Promise((resolve) => {
        const timeout = setTimeout(() => {
            if (app) {
                app.kill('SIGTERM');
            }
            resolve();
        }, 2000);

        if (app) {
            app.once('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        } else {
            clearTimeout(timeout);
            resolve();
        }
    });

    // Cleanup
    app = null;
    ws = null;
    isReady = false;
    authInfo = null;
    pendingTests.clear();
}

function isRunning() {
    return isReady && app !== null;
}

module.exports = {
    startApp,
    stopApp,
    run,
    isRunning
};
