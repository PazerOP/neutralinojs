# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Neutralinojs is a lightweight, portable desktop application framework for building cross-platform apps with JavaScript, HTML, and CSS. Unlike Electron, it uses native OS webviews (GTK WebKit2 on Linux, WebKit on macOS, WebView2 on Windows) instead of bundling Chromium.

## Build Commands

```bash
# Build the framework (produces ./bin/neutralino-${OS}_${ARCH})
./scripts/bz.py

# Verbose build output
./scripts/bz.py --verbose

# Cross-compile on macOS
./scripts/bz.py --target_arch x64|arm64|armhf
```

## Testing

```bash
# Prerequisites (run once)
npm i -g @electron/asar
cd ../neutralino.js && npm ci
cd ../neutralinojs && ./scripts/make_res_neu.sh

# Run all tests
cd spec && npm ci && npm run test

# Run specific spec module
cd spec && node index.js [specModule]

# Linux requires display server
xvfb-run npm run test
```

Test specs are in `/spec/*.spec.js` (app, clipboard, computer, debug, events, extensions, filesystem, os, server, storage, window).

## Architecture

**Entry point**: `main.cpp` initializes in sequence: settings → resources → auth → server → logger → extensions → app mode

**Application Modes** (configured in `neutralino.config.json`):
- **Window** - Native window with embedded webview
- **Browser** - Opens in default browser
- **Cloud** - Web application (restricted APIs)
- **Chrome** - Custom Chromium process (restricted APIs)

**Key directories**:
- `api/` - Native API modules (app, clipboard, computer, custom, debug, events, extensions, fs, os, res, server, storage, window)
- `auth/` - Authentication and permissions
- `server/` - WebSocket server and HTTP routing
- `lib/` - Third-party header-only libraries (asio, json, webview, websocketpp, etc.)

**Communication**: WebSocket connection between JavaScript frontend and C++ backend for native operations.

## Code Conventions

**C++ Standards**: C++17

**Naming**:
- Classes/Structs: PascalCase (`WindowOptions`, `WindowMenuItem`)
- Functions: camelCase (`getConfig()`, `initFramework()`)
- Constants/Macros: `NEU_` prefix with SCREAMING_SNAKE_CASE

**Platform conditionals**:
```cpp
#if defined(_WIN32)      // Windows
#if defined(__linux__)   // Linux
#if defined(__APPLE__)   // macOS
#if defined(__FreeBSD__) // FreeBSD
```

**Header guards**: `#ifndef NEU_MODULE_H` pattern

## Build Configuration

Build settings are in `buildzri.config.json` with platform-specific:
- Include paths
- Source files
- Compiler options and definitions

Output binary naming: `neutralino-${OS}_${ARCH}` (e.g., `neutralino-linux_x64`)

## Platform Requirements

Linux build requires: GTK3, WebKit2GTK, X11 libraries
