//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Native oxlint rules on top of oxlint's correctness category, which `./index.ts` enables as errors.
// They follow the ESLint configuration: ESLint recommended, import-x recommended and typescript-eslint's strict and stylistic presets.
// Rules of ESLint plugins that oxlint runs as JS plugins are added in `./index.ts`.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { DummyRuleMap } from "oxlint";
import typescriptEslintPresetEntries from "virtual:typescript-eslint-presets";

/**
 * ESLint recommended and import rules for every JavaScript and TypeScript file.
 */
export const allFilesRules: DummyRuleMap = {
  "no-case-declarations": "error",
  "no-empty": "error",
  "no-fallthrough": "error",
  "no-prototype-builtins": "error",
  "no-redeclare": "error",
  "no-regex-spaces": "error",
  "no-undef": "error",
  "no-useless-assignment": "error",
  "preserve-caught-error": ["error", { requireCatchParameter: false }],
  "import/export": "error",
  "import/no-named-as-default": "warn",
  "import/no-named-as-default-member": "warn",
  "import/no-duplicates": "warn",
};

/**
 * Import rules for `.js`, `.jsx`, `.ts` and `.tsx` files.
 */
export const jsTsRules: DummyRuleMap = {
  "import/no-empty-named-blocks": "error",
  "import/no-mutable-exports": "error",
  "import/no-duplicates": ["error", { preferInline: true }],
  "import/no-cycle": "error",
  // oxlint checks the specifier, not whether the import resolves without the extension, as import-x does.
  // So `.js` and `.mjs` stay allowed: NodeNext and Node require them.
  "import/extensions": [
    "error",
    "ignorePackages",
    { ts: "never", tsx: "never", jsx: "never" },
  ],
  "import/newline-after-import": "error",
  "import/no-anonymous-default-export": "error",
};

/**
 * typescript-eslint rules that oxlint implements as ESLint core rules, which understand TypeScript syntax.
 */
const coreExtensionRules = new Set([
  "class-methods-use-this",
  "default-param-last",
  "init-declarations",
  "max-params",
  "no-array-constructor",
  "no-dupe-class-members",
  "no-empty-function",
  "no-magic-numbers",
  "no-redeclare",
  "no-shadow",
  "no-unused-expressions",
  "no-unused-private-class-members",
  "no-unused-vars",
  "no-use-before-define",
  "no-useless-constructor",
  "prefer-destructuring",
]);

const typescriptEslintPrefix = "@typescript-eslint/";

/**
 * Native rules of the installed oxlint, read from its configuration schema.
 * oxlint rejects unknown rules even when they are off.
 */
const oxlintRuleNames = (() => {
  const require = createRequire(import.meta.url);
  const schemaPath = join(
    dirname(require.resolve("oxlint/package.json")),
    "configuration_schema.json",
  );
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
    definitions: { DummyRuleMap: { properties: Record<string, unknown> } };
  };
  return new Set(Object.keys(schema.definitions.DummyRuleMap.properties));
})();

/**
 * Converts a typescript-eslint rule name to the oxlint one.
 */
/**
 * Turns off every TypeScript rule of oxlint.
 * typescript-eslint rules only apply to TypeScript files, but the correctness category enables some of them for every file.
 */
export const typeScriptRulesOff: DummyRuleMap = Object.fromEntries(
  [...oxlintRuleNames]
    .filter((name) => name.startsWith("typescript/"))
    .map((name) => [name, "off"]),
);

const toOxlintRuleName = (name: string) => {
  if (!name.startsWith(typescriptEslintPrefix)) return name;
  const rule = name.slice(typescriptEslintPrefix.length);
  return coreExtensionRules.has(rule) ? rule : `typescript/${rule}`;
};

/**
 * typescript-eslint's strict-type-checked and stylistic-type-checked presets with oxlint rule names.
 * The presets turn off the ESLint core rules that TypeScript checks itself.
 * Rules that oxlint does not have are left out; a test checks that none of them is enabled.
 * The build writes the preset rules into the package, so that oxlint does not need typescript-eslint.
 */
const typescriptEslintPresetRules = (): DummyRuleMap => {
  const entries = typescriptEslintPresetEntries;
  // Core rules first, so that the typescript-eslint versions of the same rules take precedence.
  const ordered = [
    ...entries.filter(([name]) => !name.startsWith(typescriptEslintPrefix)),
    ...entries.filter(([name]) => name.startsWith(typescriptEslintPrefix)),
  ];
  return Object.fromEntries(
    ordered
      .map(([name, entry]) => [toOxlintRuleName(name), entry] as const)
      .filter(([name]) => oxlintRuleNames.has(name)),
  ) as DummyRuleMap;
};

/**
 * TypeScript rules: typescript-eslint's presets with Grove's adjustments.
 */
export const typeScriptRules: DummyRuleMap = {
  ...typescriptEslintPresetRules(),
  "typescript/array-type": [
    "error",
    { default: "array-simple", readonly: "array-simple" },
  ],
  "typescript/no-confusing-void-expression": [
    "error",
    { ignoreArrowShorthand: true },
  ],
  "typescript/no-empty-object-type": [
    "error",
    { allowInterfaces: "with-single-extends" },
  ],
  "typescript/no-misused-promises": [
    "error",
    { checksVoidReturn: { attributes: false } },
  ],
  "no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
  ],
  "typescript/restrict-template-expressions": [
    "error",
    { allowNumber: true, allowBoolean: true },
  ],
  "typescript/return-await": ["error", "in-try-catch"],
  // Also flags string arrays, like sonarjs/no-alphabetical-sort, which this rule replaces.
  "typescript/require-array-sort-compare": [
    "error",
    { ignoreStringArrays: false },
  ],
  // Rules beyond the presets.
  "import/no-default-export": "error",
  "typescript/consistent-type-imports": [
    "error",
    {
      prefer: "type-imports",
      fixStyle: "inline-type-imports",
      disallowTypeAnnotations: false,
    },
  ],
  "no-restricted-imports": [
    "error",
    {
      name: "react",
      importNames: ["default"],
      message:
        "Import specific types directly: import { ReactNode } from 'react'",
    },
  ],
};

/**
 * The rules for TypeScript files that need type information, from `typeScriptRules` and the correctness category.
 */
export const typeAwareTypeScriptRules = [
  "typescript/await-thenable",
  "typescript/dot-notation",
  "typescript/no-array-delete",
  "typescript/no-base-to-string",
  "typescript/no-confusing-void-expression",
  "typescript/no-deprecated",
  "typescript/no-duplicate-type-constituents",
  "typescript/no-floating-promises",
  "typescript/no-for-in-array",
  "typescript/no-generated-empty-object-type",
  "typescript/no-implied-eval",
  "typescript/no-meaningless-void-operator",
  "typescript/no-misused-promises",
  "typescript/no-misused-spread",
  "typescript/no-mixed-enums",
  "typescript/no-redundant-type-constituents",
  "typescript/no-unnecessary-boolean-literal-compare",
  "typescript/no-unnecessary-condition",
  "typescript/no-unnecessary-template-expression",
  "typescript/no-unnecessary-type-arguments",
  "typescript/no-unnecessary-type-assertion",
  "typescript/no-unnecessary-type-conversion",
  "typescript/no-unnecessary-type-parameters",
  "typescript/no-unsafe-argument",
  "typescript/no-unsafe-assignment",
  "typescript/no-unsafe-call",
  "typescript/no-unsafe-enum-assignment",
  "typescript/no-unsafe-enum-comparison",
  "typescript/no-unsafe-member-access",
  "typescript/no-unsafe-return",
  "typescript/no-unsafe-unary-minus",
  "typescript/no-useless-default-assignment",
  "typescript/non-nullable-type-assertion-style",
  "typescript/only-throw-error",
  "typescript/prefer-find",
  "typescript/prefer-includes",
  "typescript/prefer-nullish-coalescing",
  "typescript/prefer-optional-chain",
  "typescript/prefer-promise-reject-errors",
  "typescript/prefer-reduce-type-parameter",
  "typescript/prefer-regexp-exec",
  "typescript/prefer-return-this-type",
  "typescript/prefer-string-starts-ends-with",
  "typescript/related-getter-setter-pairs",
  "typescript/require-array-sort-compare",
  "typescript/require-await",
  "typescript/restrict-plus-operands",
  "typescript/restrict-template-expressions",
  "typescript/return-await",
  "typescript/unbound-method",
  "typescript/use-unknown-in-catch-callback-variable",
] as const;
