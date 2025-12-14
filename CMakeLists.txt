cmake_minimum_required(VERSION 3.16)

# Get version from buildzri.config.json for consistency
file(READ "${CMAKE_SOURCE_DIR}/buildzri.config.json" BZ_CONFIG)
string(JSON NEU_VERSION GET ${BZ_CONFIG} "version")

project(neutralino VERSION ${NEU_VERSION} LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Get git commit hash
execute_process(
    COMMAND git rev-parse HEAD
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    OUTPUT_VARIABLE GIT_COMMIT
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
)
if(NOT GIT_COMMIT)
    set(GIT_COMMIT "unknown")
endif()

# Determine architecture string
if(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64|amd64")
    set(NEU_ARCH "x64")
elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "aarch64|ARM64|arm64")
    set(NEU_ARCH "arm64")
elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "armv7")
    set(NEU_ARCH "armhf")
else()
    set(NEU_ARCH ${CMAKE_SYSTEM_PROCESSOR})
endif()

# Determine OS string
if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    set(NEU_OS "linux")
elseif(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
    set(NEU_OS "mac")
elseif(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    set(NEU_OS "win")
else()
    set(NEU_OS ${CMAKE_SYSTEM_NAME})
endif()

# Common sources
set(SOURCES
    main.cpp
    settings.cpp
    resources.cpp
    helpers.cpp
    errors.cpp
    chrome.cpp
    extensions_loader.cpp
    auth/authbasic.cpp
    auth/permission.cpp
    server/router.cpp
    api/app/app.cpp
    api/clipboard/clipboard.cpp
    api/computer/computer.cpp
    api/custom/custom.cpp
    api/debug/debug.cpp
    api/events/events.cpp
    api/extensions/extensions.cpp
    api/fs/fs.cpp
    api/os/os.cpp
    api/res/res.cpp
    api/server/server.cpp
    api/storage/storage.cpp
    api/window/window.cpp
    lib/tinyprocess/process.cpp
    lib/easylogging/easylogging++.cc
    lib/platformfolders/platform_folders.cpp
    lib/clip/clip.cpp
    lib/clip/image.cpp
)

# efsw common sources
file(GLOB EFSW_SOURCES "lib/efsw/src/efsw/*.cpp")
list(APPEND SOURCES ${EFSW_SOURCES})

# infoware sources
file(GLOB_RECURSE INFOWARE_SOURCES "lib/infoware/src/**/*.cpp")
list(APPEND SOURCES ${INFOWARE_SOURCES})

# Platform-specific sources
if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    list(APPEND SOURCES
        lib/tinyprocess/process_unix.cpp
        lib/clip/clip_x11.cpp
    )
    file(GLOB EFSW_POSIX_SOURCES "lib/efsw/src/efsw/platform/posix/*.cpp")
    list(APPEND SOURCES ${EFSW_POSIX_SOURCES})
elseif(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
    list(APPEND SOURCES
        lib/tinyprocess/process_unix.cpp
        lib/clip/clip_osx.mm
        lib/webview/macwindow.mm
    )
    file(GLOB EFSW_POSIX_SOURCES "lib/efsw/src/efsw/platform/posix/*.cpp")
    list(APPEND SOURCES ${EFSW_POSIX_SOURCES})
elseif(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    list(APPEND SOURCES
        lib/tinyprocess/process_win.cpp
        lib/clip/clip_win.cpp
    )
    file(GLOB EFSW_WIN_SOURCES "lib/efsw/src/efsw/platform/win/*.cpp")
    list(APPEND SOURCES ${EFSW_WIN_SOURCES})
endif()

add_executable(neutralino ${SOURCES})

# Include directories
target_include_directories(neutralino PRIVATE
    ${CMAKE_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/lib
    ${CMAKE_SOURCE_DIR}/lib/asio/include
    ${CMAKE_SOURCE_DIR}/lib/infoware/include
    ${CMAKE_SOURCE_DIR}/lib/efsw/include
    ${CMAKE_SOURCE_DIR}/lib/efsw/src
)

if(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    target_include_directories(neutralino PRIVATE
        ${CMAKE_SOURCE_DIR}/lib/webview/windows
    )
endif()

# Common compile definitions
target_compile_definitions(neutralino PRIVATE
    NEU_VERSION="${NEU_VERSION}"
    NEU_COMMIT="${GIT_COMMIT}"
    ELPP_NO_DEFAULT_LOG_FILE=1
    ASIO_STANDALONE
    INFOWARE_VERSION="0.6.0"
    INFOWARE_USE_X11
    CLIP_ENABLE_IMAGE
)

# Platform-specific definitions and flags
if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(GTK3 REQUIRED gtk+-3.0)
    pkg_check_modules(GLIB REQUIRED glib-2.0)
    pkg_check_modules(WEBKIT2GTK webkit2gtk-4.0)
    if(NOT WEBKIT2GTK_FOUND)
        pkg_check_modules(WEBKIT2GTK REQUIRED webkit2gtk-4.1)
    endif()

    target_compile_definitions(neutralino PRIVATE
        HAVE_XCB_XLIB_H
        WEBVIEW_GTK=1
        TRAY_APPINDICATOR=1
        HAVE_PNG_H
    )

    target_include_directories(neutralino PRIVATE
        ${GTK3_INCLUDE_DIRS}
        ${GLIB_INCLUDE_DIRS}
        ${WEBKIT2GTK_INCLUDE_DIRS}
    )

    target_link_libraries(neutralino PRIVATE
        ${GTK3_LIBRARIES}
        ${GLIB_LIBRARIES}
        ${WEBKIT2GTK_LIBRARIES}
        pthread
        png
        stdc++fs
        dl
        X11
        xcb
        Xrandr
    )

    target_compile_options(neutralino PRIVATE -Os)
    target_link_options(neutralino PRIVATE -no-pie)

elseif(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
    target_compile_definitions(neutralino PRIVATE
        WEBVIEW_COCOA=1
        TRAY_APPKIT=1
        MACOSX_DEPLOYMENT_TARGET=10.7
    )

    target_compile_options(neutralino PRIVATE
        -Wno-deprecated-declarations
        -Os
    )

    set(CMAKE_OSX_DEPLOYMENT_TARGET "11.01")

    find_library(WEBKIT_FRAMEWORK WebKit REQUIRED)
    find_library(COCOA_FRAMEWORK Cocoa REQUIRED)

    target_link_libraries(neutralino PRIVATE
        ${WEBKIT_FRAMEWORK}
        ${COCOA_FRAMEWORK}
    )

elseif(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    target_compile_definitions(neutralino PRIVATE
        _WEBSOCKETPP_CPP11_STL_
        _HAS_STD_BYTE=0
        TRAY_WINAPI=1
        UNICODE
        _UNICODE
    )

    target_compile_options(neutralino PRIVATE
        /utf-8
        /EHsc
        /Os
    )

    target_link_libraries(neutralino PRIVATE
        ${CMAKE_SOURCE_DIR}/lib/webview/windows/WebView2LoaderStatic.lib
        gdi32
        version
        Ole32
        OleAut32
        wbemuuid
        ntdll
        dwmapi
    )
endif()

# Set output name to match original format: neutralino-${OS}_${ARCH}
set_target_properties(neutralino PROPERTIES
    OUTPUT_NAME "neutralino-${NEU_OS}_${NEU_ARCH}"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/bin"
)

# For multi-config generators (Visual Studio, Xcode), put output in bin/ directly
foreach(CONFIG_TYPE ${CMAKE_CONFIGURATION_TYPES})
    string(TOUPPER ${CONFIG_TYPE} CONFIG_TYPE_UPPER)
    set_target_properties(neutralino PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY_${CONFIG_TYPE_UPPER} "${CMAKE_SOURCE_DIR}/bin"
    )
endforeach()
