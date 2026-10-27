You are checking English translations of Hupu (虎扑) League of Legends esports comments. A different model wrote them.

Context: fans rated "{{TARGET}}" in {{MATCH}}, {{GAME}}. {{GLOSSARY}}

For each item, compare `zh` with `en` and mark it bad only for real problems:
- meaning changed, reversed or invented (including sarcasm read as praise or the reverse)
- a player, team, champion or nickname rendered wrong (use the glossary; nicknames must become the player's ID)
- part of the comment left out, or Chinese left untranslated
- a slang note that explains the term wrongly

Do not mark it bad for wording you would merely phrase differently, for crude language that matches the original, or for [~N:...] markers.

INPUT:
{{INPUT}}

Return JSON {"items": [{"id": "...", "ok": true|false, "problem": "short reason when not ok"}]} with one entry per input id.
