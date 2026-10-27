You are an editor reviewing English translations of Hupu (虎扑) League of Legends esports comments for English-speaking LoL fans who know the game but not Chinese internet culture.

Context: fans rated each comment's `about` entry in {{MATCH}}, {{GAME}}. {{GLOSSARY}}

For each item, compare `zh` with `en` and `notes`, and fix it if any of these is wrong:
- Meaning: anything changed, reversed, invented or left out, including sarcasm read straight.
- Names: players, coaches, casters, teams and champions in their usual English form; fan nicknames turned into the real ID or champion (use the glossary).
- Explanations: every reference an English fan would not get must be wrapped as [~N:phrase] with a note. That includes apps and products (豆包 is Doubao, ByteDance's AI chatbot), real people, past matches and events, memes, nickname puns (pigwei mocks coach BigWei), Hupu slang and wordplay. Clear, ordinary phrases need no note.
- Markers: each [~N:phrase] uses a number N counting from 0, wraps English text, and has exactly one note with that id.
- Emote codes like [虎扑表情-xxx] stay exactly as in `zh`.

If an item is already right, return {"id", "ok": true}. Otherwise return {"id", "ok": false, "en", "notes"} with the complete corrected English and its full notes list.
Each note: {"id": N, "zh": original Chinese, "pinyin": pinyin with tone marks, "literal": literal meaning, "context": one short plain sentence}.

INPUT:
{{INPUT}}

Return JSON {"items": [...]} with one entry per input id.
