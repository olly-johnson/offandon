/**
 * Strip the markdown formatting that LLMs sprinkle into chat replies even
 * when the system prompt asks for plain prose. The chat surface renders
 * raw text in a <pre> block, so unrendered markers like **bold** and
 * --- separators leak straight through to the user.
 *
 * Scope is deliberately narrow: only the markers we have seen in the wild
 * (bold, ATX headings, horizontal rules). Single asterisks are left alone
 * because they collide with normal prose ("5 * 5", "* bullet").
 */

const BOLD_STAR_RE = /\*\*([^*\n]+?)\*\*/g;
const BOLD_UNDERSCORE_RE = /__([^_\n]+?)__/g;
const HR_LINE_RE = /^[ \t]*-{3,}[ \t]*$/gm;
const ATX_HEADING_RE = /^[ \t]*#{1,6}[ \t]+/gm;
const TRIPLE_NEWLINE_RE = /\n{3,}/g;

export function stripChatMarkdown(text: string): string {
  if (text.length === 0) return text;

  return text
    .replace(BOLD_STAR_RE, "$1")
    .replace(BOLD_UNDERSCORE_RE, "$1")
    .replace(ATX_HEADING_RE, "")
    .replace(HR_LINE_RE, "")
    .replace(TRIPLE_NEWLINE_RE, "\n\n")
    .trim();
}
