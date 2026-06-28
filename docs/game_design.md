# MojAbble - Game Design Document

## Concept

Mahjong solitaire tile mechanics combined with competitive word building. Players pick exposed tiles from a layered pyramid, spell words, and chain combos for score multipliers. The board shrinks as tiles are removed, opening new letters underneath.

---

## The Board

### Layout: Classic Pyramid
68 tiles arranged in 4 layers, viewed top-down with 3D offset:

- **Layer 0 (base)**: 48 tiles in a diamond shape (6 rows, widest row is 10 tiles)
- **Layer 1**: 16 tiles, centered rectangle
- **Layer 2**: 6 tiles
- **Layer 3 (top)**: 2 tiles

Each higher layer offsets +6px right and -6px up to create the stacked look.

### Tile Freedom
A tile is "free" (playable) when:
1. No tile sits directly on top of it (same col/row, layer above)
2. At least one horizontal neighbor is missing (left OR right)

This is the mahjong solitaire rule. Players must read the board to find available letters.

### Tile Dimensions
- Width: 52px, Height: 66px
- Gap: 1px between tiles
- Corner radius: 6px
- Layer offset: 6px horizontal, 6px vertical
- 3D depth effect: 4px side face

---

## Letters

### Distribution
Three difficulty presets control the letter pool:

**Easy** - common letters heavy, no J/K/Q/V/X/Z:
A:9 B:1 C:2 D:4 E:12 F:1 G:2 H:3 I:8 J:0 K:0 L:5 M:2 N:6 O:8 P:2 Q:0 R:6 S:6 T:6 U:4 V:0 W:1 X:0 Y:2 Z:0

**Normal** - standard Scrabble-like distribution:
A:8 B:2 C:2 D:3 E:11 F:2 G:3 H:2 I:8 J:1 K:1 L:4 M:2 N:5 O:7 P:2 Q:1 R:5 S:4 T:5 U:4 V:2 W:2 X:1 Y:2 Z:1

**Hard** - flattened distribution, more rare letters:
A:5 B:2 C:3 D:3 E:7 F:3 G:3 H:3 I:5 J:2 K:2 L:3 M:3 N:4 O:5 P:3 Q:1 R:4 S:3 T:4 U:3 V:3 W:3 X:2 Y:3 Z:2

### Vowel Guarantee
After generating the pool, the game enforces a minimum vowel ratio:
- Easy: 40%
- Normal: 35%
- Hard: 25%

Consonants are replaced with weighted vowels (AEIOAEIOEAEI) until the minimum is met. Letters are then Fisher-Yates shuffled onto the board.

### Letter Scores (Scrabble values)
A:1 B:3 C:3 D:2 E:1 F:4 G:2 H:4 I:1 J:8 K:5 L:1 M:3 N:1 O:1 P:3 Q:10 R:1 S:1 T:1 U:1 V:4 W:4 X:8 Y:4 Z:10

---

## Scoring

### Word Score Formula
```
baseScore    = sum of letter values in the word
lengthBonus  = bonus from length table
comboMulti   = current combo multiplier
totalScore   = (baseScore + lengthBonus) * comboMulti
```

### Length Bonus Table
| Word Length | Bonus |
|-------------|-------|
| 3           | 0     |
| 4           | 5     |
| 5           | 15    |
| 6           | 30    |
| 7           | 50    |
| 8+          | 80 + (length - 8) * 40 |

### Combo System
- Submitting a valid word within 8 seconds of the last one increments the combo counter
- Combo acts as a score multiplier on the next word
- Combo resets to 0 on: failed submission, shuffle, swap, or timeout
- Visual escalation: text grows, color shifts from yellow to red, glow intensifies

### Penalties
- **Shuffle**: -50 points flat, combo reset
- **Swap**: -25 points per tile swapped, combo reset
- **Remaining tiles at game over**: -(sum of remaining tile scores * 0.5)

### Board Clear Bonus
Removing every tile awards +500 points and triggers a celebration.

---

## Word Rarity Tiers
Based on baseScore + lengthBonus (before combo):

| Tier       | Threshold | Color   |
|------------|-----------|---------|
| Common     | < 8       | Green   |
| Uncommon   | 8-15      | Blue    |
| Rare       | 16-28     | Purple  |
| Epic       | 29-50     | Orange  |
| Legendary  | 51+       | Gold    |

Each submitted word shows a toast with the word, rarity badge, score breakdown, and a dictionary definition fetched from an external API.

---

## Actions

### Select / Deselect
Tap a free tile to add its letter to the current word. Tap a selected tile (on board or in word area) to remove it. Backspace removes the last selected tile.

### Submit
Send the current word for validation. Minimum 3 letters. Checked against the SOWPODS dictionary (267K+ words). Invalid words shake the tiles, flash red, and reset combo.

### Shuffle
Redistributes all active tile letters randomly. Free tiles animate with a flip effect; blocked tiles change silently. Costs 50 points.

### Swap
Replaces selected tiles with new random letters from the difficulty pool. Costs 25 points per tile. Useful for getting rid of bad letters at a targeted cost.

### Light
Toggles the free-tile highlight overlay. When on, free tiles glow gold and blocked tiles dim. When off, all tiles look the same and the player has to read the board layout.

### Give Up
Ends the game immediately.

---

## Game Over Conditions
1. No valid word can be formed from the remaining free tiles (checked against full dictionary when 3 or fewer tiles remain, optimistic otherwise)
2. All tiles removed (board clear)
3. Player gives up

---

## Dictionary
SOWPODS / Collins Scrabble Words. Tournament-grade, 267K+ words. No length cap. Offensive words filtered via FNV-1a hash blocklist (51 entries). Words with legitimate primary meanings (ass, cock, hell, damn) are NOT blocked, following standard Scrabble convention.

---

## Multiplayer

### Format
Head-to-head race. Both players get identical boards generated from a shared seed (mulberry32 PRNG). Play simultaneously, highest score wins.

### Flow
1. Creator picks difficulty and creates a room (4-character code)
2. Opponent enters the code to join
3. Both clients generate the same board from the seed
4. During play, scores poll every 2 seconds
5. When one player finishes (clears board or runs out of words), the other gets a 30-second countdown
6. If countdown expires, the remaining player's game ends automatically
7. Remaining tile penalty applied to both players
8. Match result screen shows both scores, word counts, best words, and max combos
9. Opponent disconnect detection after 15 seconds of no polling

### Server
PHP flat-file backend. Room state stored as JSON in `_rooms/` directory. Rooms auto-clean after 30 minutes.

---

## Audio

All sounds are synthesized at runtime using the Web Audio API. No audio files.

| Event | Sound |
|-------|-------|
| Tile select | Rising triangle wave, pitch scales with word length |
| Tile deselect | Falling sine wave |
| Valid word | 4-note major chord arpeggio, pitch rises with combo |
| Invalid word | Two dissonant sawtooth waves |
| Combo | Rising sine sweep, pitch scales with combo level |
| Board clear | 8-note ascending scale |
| Tile flip (shuffle/swap) | Quick sine tick |

Master volume: 0.3

---

## Visual Effects

- **Particle explosions** on word submit (12+ particles per tile, count scales with score)
- **Ring bursts** radiate from each tile on select and submit
- **Screen shake** intensity scales with word score
- **Gold flash overlay** on submit
- **Background pulse** modulates the gradient
- **Scrolling word tiling** shows the last submitted word repeated across the background in varied sizes and rotations
- **Ambient floating particles** rise from the bottom continuously
- **Tile punch animation** on select (quick scale pop)
- **Tile flip animation** on shuffle/swap (3D card flip with elastic settle)
- **Tile removal animation** (float up, grow, rotate, fade out with stagger)
