/**
 * Numbers-and-colour contract for .tsx files.
 *
 * 1. Raw red/green palette classes (text-red-500, bg-green-900/20, ...) are
 *    banned: colour comes from the tone helper (@/lib/ui/tone) so one colour
 *    keeps one meaning.
 * 2. Inline number formatting in rendered output (`{n.toFixed(2)}`,
 *    `{n.toLocaleString()}`) is banned: use @/lib/ui/numbers or <Figure>/<Delta>.
 *
 * Existing offenders are listed in numbers-colour-baseline.json and switched
 * off in eslint.config.mjs; the list only shrinks.
 */
"use strict";

const RAW_COLOUR =
  /(?:^|[\s"'`:])(?:[a-z0-9-]+:)*(?:text|bg|border|ring|fill|stroke|from|via|to|divide|outline|decoration|accent|caret|shadow)-(?:red|green|emerald|rose|lime)-\d{2,3}(?![\w-])/;

const FORMAT_METHODS = new Set(["toFixed", "toLocaleString"]);

// Attributes whose value is not visible text or is an event handler.
function isExemptAttribute(name) {
  return (
    /^on[A-Z]/.test(name) ||
    name === "style" ||
    name === "key" ||
    name === "id" ||
    name === "href" ||
    name.startsWith("data-")
  );
}

function attributeName(attr) {
  return attr.name && attr.name.type === "JSXIdentifier" ? attr.name.name : "";
}

/** True when the call sits in JSX output (child or visible attribute). */
function isInRenderedOutput(node) {
  let current = node.parent;
  while (current) {
    if (current.type === "JSXExpressionContainer") {
      const owner = current.parent;
      if (owner && owner.type === "JSXAttribute") return !isExemptAttribute(attributeName(owner));
      return true;
    }
    if (current.type === "ArrowFunctionExpression" && current.body.type !== "BlockStatement") {
      current = current.parent;
      continue;
    }
    if (
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression" ||
      current.type === "ArrowFunctionExpression" ||
      current.type === "Program"
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

module.exports = {
  meta: {
    type: "problem",
    docs: { description: "Enforce the numbers-and-colour contract in .tsx files" },
    schema: [],
    messages: {
      rawColour:
        "Raw red/green palette class `{{cls}}`. Use the tone helper (@/lib/ui/tone), <Delta> or <Figure>.",
      inlineFormat:
        "Inline `.{{method}}()` in rendered output. Use @/lib/ui/numbers, <Figure> or <Delta>.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!filename.endsWith(".tsx") || /\.test\.tsx$/.test(filename)) return {};

    function checkString(node, text) {
      const match = RAW_COLOUR.exec(text);
      if (match) context.report({ node, messageId: "rawColour", data: { cls: match[0].trim() } });
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") checkString(node, node.value);
      },
      TemplateElement(node) {
        checkString(node, node.value.cooked ?? node.value.raw);
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          FORMAT_METHODS.has(callee.property.name) &&
          isInRenderedOutput(node)
        ) {
          context.report({
            node,
            messageId: "inlineFormat",
            data: { method: callee.property.name },
          });
        }
      },
    };
  },
};
