//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//
import { type Linter, type Rule } from "eslint";

/**
 * The parts of eslint-plugin-sonarjs that the rule split reads.
 * The callers pass the plugin in, so that this module does not load it: it is an optional peer dependency.
 */
export interface SonarjsPlugin {
  configs: { recommended: Linter.Config };
  rules: Record<string, Rule.RuleModule | undefined>;
}

const isEnabled = (entry: Linter.RuleEntry | undefined) => {
  const level = Array.isArray(entry) ? entry[0] : entry;
  return level !== undefined && level !== "off" && level !== 0;
};

/**
 * Rules that sonarjs marks as requiring type information, but that report the same findings without it.
 * They run in oxlint.
 * `assertions-in-tests` is not one of them: without types it misses assertions inside helper functions.
 */
const rulesWorkingWithoutTypes = new Set([
  "sonarjs/bitwise-operators",
  "sonarjs/concise-regex",
  "sonarjs/duplicates-in-character-class",
  "sonarjs/empty-string-repetition",
  "sonarjs/no-collection-size-mischeck",
  "sonarjs/no-empty-after-reluctant",
  "sonarjs/no-empty-alternatives",
  "sonarjs/no-empty-group",
  "sonarjs/no-redundant-optional",
  "sonarjs/no-small-switch",
  "sonarjs/regex-complexity",
  "sonarjs/single-char-in-character-classes",
  "sonarjs/single-character-alternation",
  "sonarjs/slow-regex",
]);

/**
 * Type-aware sonarjs rules that oxlint or another rule of the type-aware ESLint configuration already covers, with the rule that covers each.
 * The type-aware ESLint configuration leaves them out; `sonarjs/deprecation` alone took most of its time.
 */
export const sonarRulesCoveredElsewhere: Record<string, string> = {
  "sonarjs/deprecation": "typescript/no-deprecated",
  "sonarjs/jsx-no-leaked-render":
    "@eslint-react/no-leaked-conditional-rendering",
  "sonarjs/no-alphabetical-sort": "typescript/require-array-sort-compare",
  "sonarjs/no-array-delete": "typescript/no-array-delete",
  "sonarjs/no-control-regex": "no-control-regex",
  "sonarjs/no-empty-character-class": "no-empty-character-class",
  "sonarjs/no-invalid-regexp": "no-invalid-regexp",
  "sonarjs/no-misleading-character-class": "no-misleading-character-class",
  "sonarjs/no-regex-spaces": "no-regex-spaces",
  "sonarjs/no-useless-intersection":
    "typescript/no-redundant-type-constituents",
  "sonarjs/prefer-regexp-exec": "typescript/prefer-regexp-exec",
  "sonarjs/unused-import": "no-unused-vars",
};

const requiresTypeChecking = (sonarjs: SonarjsPlugin, name: string) => {
  if (rulesWorkingWithoutTypes.has(name)) return false;
  const docs = sonarjs.rules[name.replace(/^sonarjs\//, "")]?.meta?.docs as
    | { requiresTypeChecking?: boolean }
    | undefined;
  return docs?.requiresTypeChecking === true;
};

/**
 * Grove's adjustments to the sonarjs recommended rules.
 */
const sonarRuleOverrides: Linter.RulesRecord = {
  "sonarjs/cognitive-complexity": ["error", 20],
};

/**
 * Returns the enabled sonarjs recommended rules, split by whether a rule needs TypeScript type information.
 * oxlint runs JS plugins without type information, so the type-aware rules stay in ESLint.
 */
export const getSonarRuleSet = (
  sonarjs: SonarjsPlugin,
  { typeAware }: { typeAware: boolean },
) =>
  Object.fromEntries(
    Object.entries(sonarjs.configs.recommended.rules ?? {})
      .filter(([, entry]) => isEnabled(entry))
      .filter(([name]) => requiresTypeChecking(sonarjs, name) === typeAware)
      .filter(([name]) => !(name in sonarRulesCoveredElsewhere))
      .map(([name, entry]) => [name, sonarRuleOverrides[name] ?? entry]),
  ) as Linter.RulesRecord;
