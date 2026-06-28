# MojAbble - App Icon & Screenshot Specs

## App Icon

### Requirements
- 1024x1024 px (single asset, iOS generates all sizes from this)
- PNG, no transparency, no rounded corners (iOS applies the mask)
- sRGB color space

### Design Direction
The game's visual identity is dark blue/purple background (#0a0e27) with gold (#ffd700) accents. The icon should work at small sizes (29px on home screen).

Suggested concept: a stylized layered tile stack with a gold letter on the top tile, set against the dark gradient background. Keep it simple. One letter, a few stacked shapes, gold on dark.

Avoid: screenshots of gameplay, text-heavy designs, thin details that disappear at small sizes.

---

## Screenshots

### Required Sizes
Apple requires screenshots for each device size you support. At minimum:

| Device              | Size (portrait)   | Required |
|---------------------|-------------------|----------|
| iPhone 6.9" (16 Pro Max) | 1320 x 2868  | Yes      |
| iPhone 6.7" (15 Pro Max) | 1290 x 2796  | Yes      |
| iPhone 6.5" (11 Pro Max) | 1284 x 2778  | Recommended |
| iPhone 5.5" (8 Plus)     | 1242 x 2208  | If supporting |

You can use 6.9" screenshots and Apple will scale them down for smaller sizes if you check "Use 6.9-inch Display" as the default.

### Screenshot Count
- Minimum: 1
- Maximum: 10
- Recommended: 5

### Suggested Screenshots (in order)

1. **Gameplay** - Mid-game board with some tiles removed, a word being spelled in the word area, score visible. Shows the core loop at a glance.

2. **Combo in action** - A big combo multiplier on screen with particle effects, score popup, gold flash. Shows the juice.

3. **Start screen** - Title, difficulty selector, leaderboards visible. Shows polish and modes.

4. **Multiplayer** - The VS match result screen or the opponent bar during gameplay. Shows head-to-head.

5. **Word stats toast** - A rare/epic word just submitted with the definition popup visible. Shows the dictionary depth.

### Capture Tips
- Use Xcode Simulator at the right resolution, or take screenshots on-device
- Game is landscape-capable but primarily portrait. Capture in portrait.
- The dark background photographs well. No need for framing or device mockups (Apple prefers raw screenshots now).

---

## App Preview Video (optional)
- Up to 30 seconds
- Same resolution as screenshots
- Good candidate: speed through a game showing tile selection, word submit, combo chain, board clear celebration
- No required, but significantly boosts conversion on the App Store
