import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import type { Element, Root } from "hast";

// Preserve editor typography without accepting CSS URLs, overlays or executable markup.
const safeStyle = (value: string) => value.split(";").filter((declaration) => {
  const match = /^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i.exec(declaration);
  if (!match) return false;
  const [, property, setting] = match;
  switch (property.toLowerCase()) {
    case "color":
    case "background-color": return /^(#[\da-f]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\))$/i.test(setting);
    case "font-size": return /^(\d{1,3}(\.\d+)?(px|em|rem|%)|small|medium|large|x-large)$/i.test(setting);
    case "text-align": return /^(left|right|center|justify)$/i.test(setting);
    default: return false;
  }
}).join(";");

const safeVideo = (value: unknown) => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["www.youtube.com", "www.youtube-nocookie.com"].includes(url.hostname) &&
      /^\/embed\/[\w-]+$/.test(url.pathname);
  } catch { return false; }
};

const cleanEditorAttributes = () => (tree: Root) => {
  const walk = (parent: Root | Element) => {
    parent.children = parent.children.filter((child) => {
      if (child.type !== "element") return true;
      if (child.tagName === "iframe" && !safeVideo(child.properties.src)) return false;
      if (typeof child.properties.style === "string") child.properties.style = safeStyle(child.properties.style);
      if (child.tagName === "iframe") child.properties.style = "width:100%;aspect-ratio:16/9;border:0";
      if (child.tagName === "a") child.properties.rel = ["noopener", "noreferrer"];
      walk(child);
      return true;
    });
  };
  walk(tree);
};

// Match fragment targets to the sanitizer's DOM-clobbering-safe IDs.
const restoreFragmentLinks = () => (tree: Root) => {
  const walk = (parent: Root | Element) => {
    for (const child of parent.children) {
      if (child.type !== "element") continue;
      const href = child.properties.href;
      if (child.tagName === "a" && typeof href === "string" && href.startsWith("#") && href.length > 1) {
        child.properties.href = `#${defaultSchema.clobberPrefix}${href.slice(1)}`;
      }
      walk(child);
    }
  };
  walk(tree);
};

const sanitizer = unified()
  .use(rehypeParse, { fragment: true })
  .use(cleanEditorAttributes)
  .use(rehypeSanitize, {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), "figure", "figcaption", "iframe"],
    attributes: {
      ...defaultSchema.attributes,
      "*": [...(defaultSchema.attributes?.["*"] ?? []), "style"],
      a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
      img: [...(defaultSchema.attributes?.img ?? []), "width", "height", "alt", "loading"],
      iframe: ["src", "title", "width", "height", "allowFullScreen", "loading", "style"]
    },
    protocols: { ...defaultSchema.protocols, src: ["https"] }
  })
  .use(restoreFragmentLinks)
  .use(rehypeStringify);

export const sanitizeNewsHtml = (html: string) => String(sanitizer.processSync(html));
