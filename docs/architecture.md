# MojAbble - iOS App Architecture

## Overview

MojAbble is a hybrid app: a native iOS shell (Capacitor) wrapping a web-based game (HTML5 Canvas + vanilla JS). The game logic, rendering, and UI all run in a WKWebView. The native shell provides App Store distribution, device integration, and safe area handling. The backend is a PHP flat-file API hosted on a remote server.

```
┌─────────────────────────────────────────────┐
│                 iPhone 16                    │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │         Capacitor Native Shell        │  │
│  │           (Swift / Xcode)             │  │
│  │                                       │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │          WKWebView              │  │  │
│  │  │                                 │  │  │
│  │  │  ┌──────────┐  ┌────────────┐  │  │  │
│  │  │  │  Canvas   │  │  HTML/CSS   │  │  │  │
│  │  │  │  (board,  │  │  (menus,    │  │  │  │
│  │  │  │  effects) │  │  overlays)  │  │  │  │
│  │  │  └──────────┘  └────────────┘  │  │  │
│  │  │                                 │  │  │
│  │  │  ┌──────────────────────────┐  │  │  │
│  │  │  │     JavaScript Engine     │  │  │  │
│  │  │  │  engine / render / audio  │  │  │  │
│  │  │  │  words / main             │  │  │  │
│  │  │  └──────────────────────────┘  │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│                                             │
│              ▼ HTTPS ▼                      │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │         IONOS Server (PHP)            │  │
│  │  scores.php  │  room.php              │  │
│  │  _scores/    │  _rooms/               │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## Layer Breakdown

### 1. Native Shell (Capacitor)

**What it does**: Wraps the web app in a native iOS application. Provides the App Store binary, app icon, splash screen, and access to native APIs.

**Files**:
```
ios/App/
├── App.xcodeproj          # Xcode project
├── App.xcworkspace         # Workspace (use this to open in Xcode)
├── Podfile                 # CocoaPods dependencies
└── App/
    ├── AppDelegate.swift   # App lifecycle
    ├── Info.plist           # iOS configuration
    ├── Assets.xcassets/     # App icon + splash images
    ├── Base.lproj/          # Storyboards (launch + main)
    └── public/              # Web assets copied here on build
```

**Configuration** (`capacitor.config.json`):
```json
{
  "appId": "com.mojabble.app",
  "appName": "MojAbble",
  "webDir": "www",
  "ios": {
    "contentInset": "always"
  }
}
```

**Native plugins** (potential additions):
- `@capacitor/haptics` - tactile feedback on tile select, word submit, combo
- `@capacitor/status-bar` - light text on dark background
- `@capacitor/splash-screen` - custom splash during dictionary load

### 2. Web Layer (Game)

**What it does**: All game logic, rendering, UI, and audio. Runs entirely in the WebView. No framework, no build step, vanilla JS.

**File structure**:
```
www/                      # Built output (copied from source on build)
├── index.html            # Single-page app: game + all screens
├── docs.html             # Rules/reference page
├── words.txt             # Dictionary file (267K words)
└── js/
    ├── engine.js          # Board state, tile logic, layout, letter generation
    ├── render.js          # Canvas rendering, animations, particle effects
    ├── audio.js           # Web Audio API sound synthesis
    ├── words.js           # Dictionary loading, validation, scoring tables
    └── main.js            # Game controller, UI bindings, multiplayer, leaderboards
```

### 3. API Layer (PHP Backend)

**What it does**: Global leaderboards and multiplayer room management. Flat-file JSON storage, no database.

**Endpoints**:

| File | Endpoint | Method | Purpose |
|------|----------|--------|---------|
| scores.php | ?action=scores | GET | Fetch top 50 scores + top 50 rare words |
| scores.php | ?action=submit | POST | Submit a score entry |
| room.php | ?action=create | POST | Create multiplayer room |
| room.php | ?action=join | POST | Join a room by code |
| room.php | ?action=poll | GET | Poll room state / opponent stats |
| room.php | ?action=update | POST | Send current game stats |
| room.php | ?action=finish | POST | Signal game completion |

**Storage**:
```
_scores/
├── scores.json            # Top 50 high scores
├── rare.json              # Top 50 rarest words
└── rate.json              # Rate limit tracking by IP

_rooms/
├── XXXX.json              # Active room state (auto-cleaned after 30 min)
```

**Security**:
- Rate limiting: 1 submission per 5 seconds per IP
- Input sanitization: names stripped to `[\w\s\-.]`, max 16 chars
- Score bounds checking: 1-999,999 score, 1-500 words, 0-200 combo
- Room codes: alphanumeric, 4 chars, sanitized on input
- CORS headers: open (required for Capacitor WebView origin)
- Room auto-cleanup: 5% chance per request, removes rooms older than 30 minutes

---

## Module Architecture

### JavaScript Modules

All modules attach to the `window.MojAbble` namespace. No module bundler, no imports. Load order matters.

```
Load Order:
  1. words.js    → MojAbble.WordValidator, MojAbble.loadDictionary
  2. audio.js    → MojAbble.AudioManager
  3. engine.js   → MojAbble.Board, MojAbble.ScoreManager, MojAbble.C, MojAbble.mulberry32
  4. render.js   → MojAbble.Renderer, MojAbble.Effects, MojAbble.Particle
  5. main.js     → Game class (instantiated on DOMContentLoaded after dictionary load)
```

### Module Responsibilities

**engine.js** - Game State
- `Board` class: tile grid, layout generation, letter assignment, selection state, free-tile detection, shuffle, swap, game-over detection, seeded PRNG for multiplayer
- `ScoreManager` class: score tracking, combo system, display interpolation, word statistics
- `C` constants object: all tuning values
- `Tile` class: individual tile state

**render.js** - Visuals
- `Renderer` class: canvas setup, per-frame render loop (tiles, highlights, animations, background)
- `Effects` class: particles, screen shake, flash, pulse, ring bursts, popups, ambient particles
- `Particle` class: individual particle physics

**audio.js** - Sound
- `AudioManager` class: Web Audio API context, synthesized sound effects (no audio files)

**words.js** - Dictionary
- `WordValidator` object: word lookup, letter scoring, length bonuses
- `loadDictionary` function: fetches and parses words.txt
- FNV-1a hash-based offensive word filter

**main.js** - Controller
- `Game` class: owns all other modules, handles UI events, manages game state machine, multiplayer polling, leaderboard display
- `API_BASE` constant: server URL (empty for web, set to IONOS domain for native app)

### Data Flow

```
User Input (tap/keyboard)
       │
       ▼
   Game (main.js)
       │
       ├──► Board (engine.js)      ── tile selection, word formation
       │       │
       │       ▼
       ├──► WordValidator (words.js) ── is this a real word?
       │       │
       │       ▼
       ├──► ScoreManager (engine.js) ── calculate score, update combo
       │       │
       │       ▼
       ├──► Effects (render.js)     ── particles, shake, flash
       │
       ├──► AudioManager (audio.js) ── play sound
       │
       ├──► Renderer (render.js)    ── draw frame (called 60fps via rAF)
       │
       └──► Server (fetch)          ── submit score, poll multiplayer
```

---

## Build Pipeline

### Source to Device

```
Source files (project root)
       │
       ▼
   npm run build
       │
       ├── Copy index.html, docs.html, words.txt → www/
       ├── Copy js/ → www/js/
       └── npx cap copy ios
              │
              ▼
       www/ contents → ios/App/App/public/
              │
              ▼
       GitHub Actions (macos-14 runner)
              │
              ├── npm ci
              ├── Build www + cap sync
              ├── pod install
              ├── xcodebuild (signed)
              └── Upload to TestFlight
                     │
                     ▼
               iPhone (TestFlight install)
```

### Key Files in Build

| File | Purpose |
|------|---------|
| package.json | Dependencies + build scripts |
| capacitor.config.json | App ID, name, web directory, iOS settings |
| ios/App/Podfile | CocoaPods dependencies for native plugins |
| .github/workflows/build-ios.yml | CI/CD pipeline |

---

## Data Storage

### Client-Side (localStorage)
| Key | Content |
|-----|---------|
| `mojabble_scores` | Array of top 10 local score entries |
| `mojabble_rare` | Array of top 10 local rare word entries |
| `mojabble_name` | Saved player name string |

### Server-Side (flat-file JSON)
| File | Content | Max Size |
|------|---------|----------|
| `_scores/scores.json` | Top 50 global scores | ~15 KB |
| `_scores/rare.json` | Top 50 rarest words | ~8 KB |
| `_scores/rate.json` | IP rate limit map | ~2 KB |
| `_rooms/XXXX.json` | Single room state | ~1 KB |

---

## Network Requests

### From App to Server

| When | Endpoint | Frequency |
|------|----------|-----------|
| Start menu load | GET scores | Once |
| Game over | POST submit | Once |
| After submit | GET scores | Once (refresh) |
| MP create room | POST create | Once |
| MP waiting | GET poll | Every 1.5s |
| MP gameplay | POST update + GET poll | Every 2s |
| MP finish | POST finish | Once |
| Word submitted | GET dictionaryapi.dev | Once per word |

### External API
- Free Dictionary API (`api.dictionaryapi.dev`) for word definitions in the stats toast
- Fallback to local letter stats if API unavailable
- Not critical to gameplay

---

## Offline Capability

| Feature | Offline? | Notes |
|---------|----------|-------|
| Single player | Yes | Dictionary bundled, all logic client-side |
| Local leaderboard | Yes | localStorage |
| Global leaderboard | No | Requires server |
| Multiplayer | No | Requires server |
| Word definitions | No | Falls back to letter stats |
| Audio | Yes | Synthesized in-browser |
