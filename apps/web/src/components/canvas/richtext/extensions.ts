import { Extension } from "@tiptap/core";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import { tipTapDefaultExtensions } from "tldraw";

/**
 * FontSize — a minimal ProseMirror mark that adds a font-size attribute to
 * TextStyle so users can bump a selection from 12px → 32px inside a text
 * shape without having to change the shape-level size enum (which applies
 * to the whole box).
 *
 * It layers on top of tldraw's built-in TextStyle-compatible pipeline:
 * we render the size as an inline `style="font-size: …"` attribute, which
 * round-trips through the ProseMirror JSON that tldraw persists to the
 * shape's `richText` prop.
 */
const FontSize = Extension.create<{ types: string[] }>({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: { fontSize?: string | null }) => {
              if (!attrs.fontSize) return {};
              return { style: `font-size: ${attrs.fontSize}` };
            },
          },
        },
      },
    ];
  },
});

/**
 * The full set of TipTap extensions used by rich-text editing inside
 * Directoor. Built on top of tldraw's defaults (Bold / Italic / Strike /
 * Code / Link / BulletList / OrderedList / ListItem / Highlight / …) with
 * Underline and a per-selection FontSize mark added on top for the text
 * shape. StarterKit inside tldraw's defaults already ships with
 * bulletList / orderedList / listItem, so no extra packages needed for
 * list support — we just have to surface toggles in the toolbar.
 */
export const directoorTipTapExtensions = [
  ...tipTapDefaultExtensions,
  Underline,
  TextStyle,
  FontSize,
];
