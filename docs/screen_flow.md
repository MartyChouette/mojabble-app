# MojAbble - Screen Flow

## Screen Map

```
                    ┌─────────────┐
                    │  APP LAUNCH  │
                    └──────┬──────┘
                           │
                    (load dictionary)
                           │
                    ┌──────▼──────┐
              ┌─────│  START MENU  │─────┐
              │     └──────┬──────┘      │
              │            │             │
         [tap VS]    [tap Play]    [tap Docs icon]
              │            │             │
       ┌──────▼──────┐    │      ┌──────▼──────┐
       │  MP LOBBY   │    │      │    DOCS     │
       └──┬─────┬────┘    │      └─────────────┘
          │     │         │
    [Create]  [Join]      │
          │     │         │
   ┌──────▼───┐ │        │
   │ WAITING  │ │        │
   │ (poll)   │ │        │
   └────┬─────┘ │        │
        │       │        │
   [opponent    │        │
    joins]      │        │
        │       │        │
        ▼       ▼        ▼
       ┌────────────────────┐
       │     GAMEPLAY       │
       │                    │
       │  (canvas + UI)     │
       └─────────┬──────────┘
                 │
        ┌────────┼────────┐
        │        │        │
   [board    [no words  [give
    clear]    left]      up]
        │        │        │
        ▼        ▼        ▼
   ┌─────────────────────────┐
   │  is multiplayer active? │
   └─────┬───────────┬──────┘
         │           │
       [yes]       [no]
         │           │
   ┌─────▼─────┐  ┌──▼──────────┐
   │  MP FINISH │  │  GAME OVER  │
   │  (poll)    │  │  (solo)     │
   └─────┬─────┘  └──────┬──────┘
         │               │
   [both done]      [tap Restart]
         │               │
   ┌─────▼─────┐         │
   │  MATCH    │         │
   │  RESULT   │         │
   └─────┬─────┘         │
         │               │
   [Back to Menu]   [Back to Menu]
         │               │
         └───────┬───────┘
                 │
          ┌──────▼──────┐
          │  START MENU  │
          └─────────────┘
```

---

## Screen Details

### 1. App Launch
- **What happens**: Dictionary file (words.txt, 267K words) loads via fetch
- **UI**: Play button shows "Loading..." and is disabled
- **Duration**: Under 500ms on iPhone 16
- **Transition**: Auto to Start Menu when dictionary ready
- **Error handling**: If dictionary fails to load, game still starts (button re-enables). Words just won't validate.

### 2. Start Menu
- **Elements**:
  - Title: "MojAbble"
  - Subtitle: "Mahjong meets Scrabble"
  - How-to-play blurb
  - Dictionary badge (SOWPODS / Collins)
  - Difficulty selector: Easy / Normal / Hard (default: Normal)
  - Player name input (persisted to localStorage)
  - Personal best display
  - Play button
  - VS button (opens multiplayer lobby)
  - Leaderboard tabs: Global / Local
  - Two board columns: High Scores + Rarest Words
  - Docs icon (bottom-right corner)
- **Inputs**:
  - Tap difficulty button to switch
  - Type player name
  - Tap Play to start solo game
  - Tap VS to open multiplayer lobby
  - Tap board tabs to switch Global/Local
  - Press Enter or Space to start
- **On entry**: Fetches global scores from server, shows local best

### 3. Multiplayer Lobby
- **Elements**:
  - Title: "Multiplayer"
  - Subtitle: "Head-to-head race"
  - Create Room button
  - Join input (4-character code) + Join button
  - Error message area
  - Back button
- **Inputs**:
  - Tap Create Room: POST to server, go to Waiting screen
  - Type code + tap Join (or Enter): POST to server, start game immediately
  - Tap Back: return to Start Menu
- **Errors shown**: "Room not found", "Game already in progress", "Room is full", server unreachable

### 4. Waiting for Opponent
- **Elements**:
  - Title: "Room Created"
  - Subtitle: "Share this code"
  - Large room code display (e.g. "5TWB")
  - Pulsing "Waiting for opponent..." text
  - Cancel button
- **Behavior**: Polls server every 1.5 seconds
- **Transition**: When opponent joins, auto-starts game with shared seed
- **Cancel**: Stops polling, returns to lobby

### 5. Gameplay
- **Elements**:
  - Full-screen canvas (tile board with 3D pyramid)
  - Score display (top-right): animated number + "SCORE" label
  - Tiles remaining counter (top-left)
  - Combo display (top-center, visible when combo > 1)
  - Word area (bottom): shows selected letters as tiles
  - Button bar: Clear / Swap / Submit / Shuffle / Light / Give Up
  - Word stats toast (top-center, appears after each valid word for 6 seconds)
  - Opponent bar (top-right, multiplayer only): name, score, word count
  - Countdown overlay (center, multiplayer only): big red number
- **Canvas interactions**:
  - Tap/click free tile: select it
  - Tap/click selected tile: deselect it
  - Hover free tile: subtle lift effect
- **Keyboard**:
  - Enter: submit word
  - Escape: clear selection
  - Backspace: deselect last tile
- **Effects**: Particles, screen shake, flashes, ring bursts, background word tiling

### 6. Game Over (Solo)
- **Elements**:
  - Title: "Game Over"
  - Final score (large)
  - Stats block: words found, best word, max combo, letters used, remaining penalty, difficulty
  - Leaderboard tabs: Global / Local
  - Two board columns: High Scores + Rarest Words (current score highlighted)
  - Restart button
- **On entry**: Saves score locally, submits to server, refreshes global boards
- **Transition**: Restart goes directly to Gameplay. No explicit "back to menu" (restart starts a new game).

### 7. MP Finish (transition state)
- **Not a visible screen** - happens behind the scenes
- Sends final score to server
- If both players done: immediately show Match Result
- If opponent still playing: poll every 1.5 seconds waiting for them to finish
- If countdown was active and expired: auto-finish

### 8. Match Result
- **Elements**:
  - Title: "You Win!" (gold) / "You Lose" (red) / "Tie!" (blue) / "Opponent Left" (gold)
  - Two match cards side by side:
    - Your card: name, score, words found, best word, max combo
    - Opponent card: same stats
    - Winner card highlighted with gold border and glow
  - Back to Menu button
- **On entry**: Saves score locally + submits to server
- **Transition**: Back to Menu returns to Start Menu

### 9. Docs Page
- **Separate HTML file** (docs.html)
- Accessed via floating icon on Start Menu
- Contains game rules, scoring reference, changelog
- Has its own back navigation

---

## Transition Summary

| From | To | Trigger |
|------|----|---------|
| App Launch | Start Menu | Dictionary loaded |
| Start Menu | Gameplay | Tap Play / Enter / Space |
| Start Menu | MP Lobby | Tap VS |
| Start Menu | Docs | Tap docs icon |
| MP Lobby | Waiting | Tap Create Room |
| MP Lobby | Gameplay | Join room (opponent already waiting) |
| MP Lobby | Start Menu | Tap Back |
| Waiting | Gameplay | Opponent joins (auto) |
| Waiting | MP Lobby | Tap Cancel |
| Gameplay | Game Over | No words left / Give Up (solo) |
| Gameplay | MP Finish | No words left / Give Up / Board clear (multiplayer) |
| Gameplay | Game Over | Board clear + 2s delay (solo) |
| MP Finish | Match Result | Both players finished |
| Game Over | Gameplay | Tap Restart |
| Match Result | Start Menu | Tap Back to Menu |

---

## Overlay Hierarchy (z-index)

| Layer | z-index | Element |
|-------|---------|---------|
| Canvas | 0 | Game board, particles, effects |
| UI Overlay | 10 | Score, combo, tiles left, word area, buttons |
| Word Stats Toast | 20 | Definition popup |
| Start Screen | (flex overlay) | Menu |
| Game Over | (flex overlay) | Results |
| MP Screens | 100 | Lobby, Waiting, Match Result |
| MP Countdown | 15 | Red countdown number during gameplay |
