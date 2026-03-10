import { MarkdownPostProcessor, MarkdownPostProcessorContext } from 'obsidian';
import { convertFurigana } from './converter';

// Block-level tags to search for furigana syntax.
// Inline elements (<a>, <span>, etc.) are handled by the recursive walk.
const TAGS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote';

/**
 * Recursively walk a DOM node, collect Text children, and convert each one.
 * Skips <code>, <ruby>, and <script>/<style> subtrees.
 */
function replaceInNode(node: Node): void {
  const textNodesToProcess: Text[] = [];

  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      textNodesToProcess.push(child as Text);
    } else if (
      child.hasChildNodes() &&
      child.nodeName !== 'CODE' &&
      child.nodeName !== 'RUBY' &&
      child.nodeName !== 'SCRIPT' &&
      child.nodeName !== 'STYLE'
    ) {
      replaceInNode(child);
    }
  });

  // Process after the forEach so we don't mutate while iterating
  for (const child of textNodesToProcess) {
    child.replaceWith(convertFurigana(child));
  }
}

/** Factory that returns the MarkdownPostProcessor for Reading View. */
export function createPostProcessor(): MarkdownPostProcessor {
  return (el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
    const blocks = el.querySelectorAll(TAGS);
    if (blocks.length === 0) return;
    blocks.forEach(block => replaceInNode(block));
  };
}
