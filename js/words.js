// MojAbble - Word Dictionary
// Loads 267K+ word SOWPODS dictionary (Collins Scrabble Words, no length cap)
// Applies offensive-word blocklist (stored as opaque hashes) before building the lookup Set
(function() {
'use strict';

const LETTER_SCORES = {
  A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,
  N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10
};

// ── Offensive word filter (hashed) ──────────────────────────────────
// FNV-1a hashes of blocked words (slurs, strong profanity).
// Original words are never stored in source - only their hashes.
// Words with legitimate primary meanings (cock, ass, hell, damn)
// are NOT blocked, per standard word-game convention (Scrabble TWL).
function _fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const _BLOCKED = new Set([
  'a4705559','06d6111e','dc08ae09','dbaaaa0e','1414e96a','b5eaf25b',
  '9deacc93','78a084a0','36c9c3b0','f6a4b84e','824e0807','f9603045',
  'c86be502','7f8fc16d','ed4d023a','21e8e371','639d5c26','da97b6a4',
  'f3d4d475','2d708b46','cb5249e9','ac89dd6e','f23e2de2','e8e1bb43',
  '5e70e3f3','2bb62280','71faa974','5851d227','5cce1a3c','473b61bc',
  'b1f8089d','17760eaa','955b3ec5','d4a3b882','7df6521e','b7c3c197',
  '948002a1','97847096','635b1b38','e6774d4a','06ce90bb','921470db',
  '8814611d','a615602a','893dcdb6','a856eb33','40d455c0','cf5447f4',
  'd16750cc','7c9ae63f','73d889a4','a49a9c69','3963bcee','92a4ff90',
  '20e05780','6cd5e87b','5cbc4498',
]);

function _isBlocked(word) {
  return _BLOCKED.has(_fnv1a(word));
}

let VALID_WORDS = new Set();
let _loaded = false;

window.MojAbble = window.MojAbble || {};

window.MojAbble.WordValidator = {
  isValid(word) {
    return VALID_WORDS.has(word.toLowerCase());
  },

  getWordScore(word) {
    let score = 0;
    for (const ch of word.toUpperCase()) {
      score += LETTER_SCORES[ch] || 0;
    }
    return score;
  },

  getLengthBonus(len) {
    if (len <= 3) return 0;
    if (len === 4) return 5;
    if (len === 5) return 15;
    if (len === 6) return 30;
    if (len === 7) return 50;
    if (len >= 8) return 80 + (len - 8) * 40;
    return 0;
  },

  getLetterScore(letter) {
    return LETTER_SCORES[letter.toUpperCase()] || 0;
  },

  get loaded() { return _loaded; },
  get _words() { return VALID_WORDS; },

  LETTER_SCORES
};

// Load dictionary from external file, filter blocked hashes
function _parseDictionary(text) {
  const words = text.split(/\r?\n/).filter(w => w.length >= 3 && !_isBlocked(w));
  VALID_WORDS = new Set(words);
  _loaded = true;
}

window.MojAbble.loadDictionary = function() {
  // Try fetch first (works on HTTP servers)
  return fetch('words.txt')
    .then(r => {
      if (!r.ok) throw new Error('fetch failed');
      return r.text();
    })
    .then(_parseDictionary)
    .catch(() => {
      // Fallback: XMLHttpRequest (handles file:// protocol - status 0)
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'words.txt', true);
        xhr.onload = function() {
          if (xhr.responseText && xhr.responseText.length > 100) {
            _parseDictionary(xhr.responseText);
            resolve();
          } else {
            reject(new Error('Empty response'));
          }
        };
        xhr.onerror = reject;
        xhr.send();
      });
    });
};

})();
