// Persistent test executor for Neutralinojs
// This script receives test code via WebSocket events, executes it, and sends results back

let testCount = 0;

// Helper to update status display
function updateStatus(message) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

function updateTestInfo(info) {
    const infoEl = document.getElementById('test-info');
    if (infoEl) {
        infoEl.textContent = info;
    }
}

// Send result back to the test runner
async function sendResult(id, result, error, exitCode) {
    try {
        await Neutralino.events.broadcast('testResult', {
            id: id,
            result: result,
            error: error,
            exitCode: exitCode || 0
        });
    } catch (err) {
        console.error('Failed to send result:', err);
    }
}

// Execute test code
async function executeTest(data) {
    const { id, code, beforeInitCode } = data;
    testCount++;
    updateTestInfo(`Running test #${testCount}: ${id}`);

    // Variables that test code can use
    let __testOutput = '';
    let __testExitCode = 0;

    // Create __close function that test code uses to return results
    const __close = async (output = '', exitCode = 0) => {
        __testOutput = output;
        __testExitCode = exitCode;
    };

    try {
        // Execute beforeInitCode if provided
        if (beforeInitCode) {
            await eval(`(async () => { ${beforeInitCode} })()`);
        }

        // Create a function that wraps the test code with __close available
        const testFn = new Function('__close', 'Neutralino', 'NL_PATH', 'NL_CWD', `
            return (async () => {
                ${code}
            })();
        `);

        // Execute the test code
        await testFn(__close, Neutralino, NL_PATH, NL_CWD);

        // Send the result
        await sendResult(id, __testOutput, null, __testExitCode);

    } catch (err) {
        console.error('Test execution error:', err);
        await sendResult(id, null, err.message || String(err), 1);
    }
}

// Initialize the test executor
async function init() {
    updateStatus('Connecting to Neutralino...');

    try {
        await Neutralino.init();
    } catch (err) {
        updateStatus('Failed to initialize: ' + err.message);
        return;
    }

    // Create temp directory for test output
    try {
        await Neutralino.filesystem.createDirectory(NL_PATH + '/.tmp');
    } catch (err) {
        // Ignore if already exists
    }

    // Listen for test execution events
    Neutralino.events.on('testExecute', async (evt) => {
        await executeTest(evt.detail);
    });

    // Listen for ready event
    Neutralino.events.on('ready', async () => {
        updateStatus('Ready - waiting for tests...');

        // Notify the test runner that we're ready
        try {
            await Neutralino.events.broadcast('testReady', { ready: true });
        } catch (err) {
            console.error('Failed to send ready signal:', err);
        }
    });

    updateStatus('Waiting for ready event...');
}

// Start initialization
init();
