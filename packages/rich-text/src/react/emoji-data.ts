// Built-in emoji list: a small set, loaded as a lazy chunk; pass
// `emojiList` for a full set.
import type { RichTextEmoji } from './types.js';

const RAW =
  'рЯША grinning smile happy|рЯШГ smiley happy|рЯШД smile happy joy|рЯШБ grin|рЯШЖ laughing|рЯШЕ sweat_smile|рЯШВ joy tears laugh|рЯЩВ slight_smile|рЯШЙ wink|рЯШК blush|рЯШН heart_eyes love|рЯ§Ф thinking|рЯШР neutral|рЯШі sleeping|рЯШО sunglasses cool|рЯШҐ cry sad|рЯШ≠ sob|рЯШ° angry rage|рЯШЃ open_mouth surprise|рЯ§Ч hug|рЯСН thumbsup like yes|рЯСО thumbsdown no|рЯСП clap applause|рЯЩМ raised_hands|рЯЩП pray thanks please|рЯТ™ muscle strong|рЯСЛ wave hello bye|рЯСА eyes look|рЯОЙ tada party celebrate|рЯОВ cake birthday|рЯОБ gift present|рЯФ• fire hot|в≠Р star|вЬ® sparkles|вЭ§пЄП heart love|рЯТФ broken_heart|рЯТѓ hundred|вЬЕ check done yes|вЭМ x cross no|вЪ†пЄП warning|вЭУ question|вЭЧ exclamation|рЯТ° bulb idea|рЯУМ pushpin pin|рЯУО paperclip attach|рЯУЭ memo note|рЯУЕ calendar date|вП∞ alarm clock time|рЯЪА rocket launch|рЯРЫ bug|рЯФТ lock secure|рЯФС key|рЯУИ chart_up growth|рЯУЙ chart_down|вШХ coffee|рЯНХ pizza|рЯМЮ sun|рЯМІпЄП rain|вЭДпЄП snowflake cold|рЯМИ rainbow';

export const EMOJI: readonly RichTextEmoji[] = RAW.split('|').map((entry) => {
  const [emoji, name, ...keywords] = entry.split(' ');
  return { emoji: emoji!, name: name!, keywords };
});
