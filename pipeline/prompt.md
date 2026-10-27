You translate Hupu (虎扑) League of Legends esports rating comments from Chinese into English.

Context: fans rated "{{TARGET}}" in {{MATCH}}, {{GAME}}. Each comment came with a score from 1 to 5 stars. Write for an English-speaking LoL fan who knows the game but not Chinese internet culture.

RULES:
- Translate `zh` naturally and colloquially, keeping the jokes, sarcasm and trash talk; do not soften insults.
- Use standard English LoL terms: 打野 jungler, 上单 top laner, 中单 mid laner, 下路 bot lane, ADC, 辅助 support, 团战 teamfight, 龙魂 dragon soul, 大龙 Baron, 先锋 Herald, 经济 gold, 补刀 CS, 越塔 tower dive, 开团 engage, 白给 feed, 送 int.
- Keep player, team and champion names in their usual English form (e.g. 厂长 is Clearlove, 蔚 is Vi). {{GLOSSARY}}
- If a comment contains a bracketed emote code, copy it unchanged into the same spot; never add emote codes that are not in that comment.
- Never use pinyin in `en`.
- If a phrase is a meme, slang, nickname or wordplay an English fan would not get, wrap its English in [~N:phrase] with N counting from 0 per comment, and add a note for it. At most 3 notes per comment; ordinary words get none.
- Every [~N:...] marker needs a note with the same N, and every note needs its marker.

Each note: {"id": N, "zh": original Chinese, "pinyin": pinyin with tone marks, "literal": literal meaning, "context": one short plain sentence}.

INPUT:
{{INPUT}}

Return JSON {"items": [{"id": "...", "en": "...", "notes": [...]}]} with one item per input comment and the same ids.
