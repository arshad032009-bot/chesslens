# Third-party notices (ChessLens)

| Component | Version | License | Where used |
|---|---|---|---|
| Stockfish (chess engine) | 10 | GPL-3.0-or-later | compiled into `engine/stockfish*.js`, `engine/stockfish.wasm` |
| Stockfish.js (Emscripten port, as published on cdnjs) | 10.0.2 | GPL-3.0 (port of Stockfish) | same files |
| chess.js | 0.10.3 | BSD-2-Clause | `vendor/chess.min.js` (license header kept inside the file; do not strip it) |

The full GNU GPL v3 text is in `COPYING`. Stockfish is copyright the Stockfish developers (see Stockfish's `AUTHORS` file in the source archive).
ChessLens loads the engine as a separate Web Worker program and talks to it only over text UCI messages. Whether that makes ChessLens itself subject to the GPL is a legal question this project does not answer: get legal advice before distributing under a non-GPL license.
Serving these files from a website counts as distributing them. The source offer in `SOURCE-OFFER.md` must be reachable from your site (for example at `/legal/`).
