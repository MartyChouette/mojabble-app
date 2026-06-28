# MojAbble - iOS-Specific Adaptations

## Safe Areas

The game canvas is fullscreen. On iPhones with a notch or Dynamic Island (iPhone X and later, including iPhone 16), the OS reserves space at the top and bottom.

### What needs to change
- **Status bar area** - The score display (top-right), tiles-left counter (top-left), and combo display (top-center) all sit at `top: 24px`. On notched phones this overlaps the status bar/Dynamic Island. Needs padding of ~50px from top in the Capacitor app, or use CSS `env(safe-area-inset-top)`.
- **Bottom bar** - The word area and buttons sit near the bottom. Home indicator overlaps. Use `env(safe-area-inset-bottom)` to push them up.
- **The canvas itself** - Full viewport is fine, game content just needs to avoid the inset zones.

### Implementation
Add to `<meta viewport>`:
```
viewport-fit=cover
```

Add CSS:
```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
```

Or apply insets specifically to the UI overlay elements that sit near edges.

---

## Status Bar

Capacitor config in `capacitor.config.json`:
```json
{
  "ios": {
    "contentInset": "always",
    "backgroundColor": "#0a0e27"
  },
  "plugins": {
    "StatusBar": {
      "style": "LIGHT",
      "backgroundColor": "#0a0e27"
    }
  }
}
```

Light text on the dark background. Match the game's background color.

---

## Haptics

iOS supports haptic feedback through the Capacitor Haptics plugin. Good candidates:

| Event | Haptic type |
|-------|-------------|
| Tile selected | Light impact |
| Word submitted (success) | Medium impact |
| Combo achieved | Heavy impact |
| Invalid word | Notification (error) |
| Shuffle/Swap | Soft impact |
| Board cleared | Success notification |

Install: `npm install @capacitor/haptics@6`

---

## Offline Behavior

Single player already works offline since the dictionary is bundled in `words.txt` and all game logic is client-side.

What breaks offline:
- Global leaderboards (scores.php) - fail silently, local scores still work
- Multiplayer (room.php) - can't create/join rooms
- Word stats dictionary API (dictionaryapi.dev) - fallback already exists in code

No changes needed. The fetch calls already have `.catch(() => {})` handlers. The app gracefully degrades.

---

## Keyboard Handling

The player name input on the start screen will trigger the iOS keyboard. The game should:
- Not zoom in when the input is focused (already handled by `maximum-scale=1.0` in viewport meta)
- Dismiss keyboard on tap outside (add a blur handler or tap listener)

During gameplay there are no text inputs, so the keyboard stays out of the way.

---

## Touch Behavior

Already handled in the current code:
- `touch-action: none` on body
- `-webkit-touch-callout: none` prevents long-press menus
- `-webkit-tap-highlight-color: transparent` removes tap flash
- `touchstart` with `preventDefault` on the canvas
- `user-select: none` prevents text selection

These are all correct for an iOS app context.

---

## Screen Rotation

The game is designed for portrait. Lock orientation in Xcode:
- Target > General > Deployment Info > check only "Portrait"

Or in `Info.plist`, set `UISupportedInterfaceOrientations` to portrait only.

---

## Performance Notes

The game uses `requestAnimationFrame` with canvas 2D rendering. Performance on any recent iPhone (including iPhone 16) will be fine. The particle system and effects are lightweight.

The 267K word dictionary loads from a text file and builds a Set. This takes a moment on first load but is a one-time cost per session. On an iPhone 16 this should be under 500ms.
