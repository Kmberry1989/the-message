Original prompt: Fix the killer animation mapping using the FBX files actually present in this project. Use run as the chase fallback and sensible fallbacks for any missing clips, then verify the playable state transitions and keep npm run check and build passing.

- Replaced nonexistent killer chase/stunned FBX paths with an explicit logical animation fallback table.
- Added render_game_to_text and advanceTime hooks for browser verification.
- Browser smoke test found and fixed the missing `dist` helper that blocked the first killer update.
- Verified browser transitions through asleep, phone distraction, search, chase -> run fallback, caught -> attack, and stun fallback.
- Final validation passed: npm run check, npm run build, Playwright smoke, and live browser state assertions.
