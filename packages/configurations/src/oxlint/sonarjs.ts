//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// eslint-plugin-sonarjs prepared for oxlint's JS plugin runtime.
//
// oxlint passes the same `context.sourceCode` object to every file it lints.
// sonarjs caches the imports of the current file keyed by that object,
// so without a reset every file after the first one sees the imports of an earlier file,
// and rules that depend on imports (for example `assertions-in-tests`) silently stop reporting.
// The wrapper clears those caches whenever a rule is created for a new AST.
// It relies on sonarjs' internal `clearFileCaches`, so the sonarjs version is pinned exactly.

import { createRequire } from "node:module";
import { type Rule } from "eslint";

const require = createRequire(import.meta.url);

const sonarjs = require("eslint-plugin-sonarjs") as {
  rules: Record<string, Rule.RuleModule>;
};
const { clearFileCaches } =
  require("eslint-plugin-sonarjs/cjs/helpers/module.js") as {
    clearFileCaches: () => void;
  };

let currentAst: unknown = undefined;

const withFileCacheReset = (rule: Rule.RuleModule): Rule.RuleModule => ({
  ...rule,
  create: (context) => {
    if (context.sourceCode.ast !== currentAst) {
      currentAst = context.sourceCode.ast;
      clearFileCaches();
    }
    return rule.create(context);
  },
});

const plugin = {
  meta: { name: "sonarjs" },
  rules: Object.fromEntries(
    Object.entries(sonarjs.rules).map(([name, rule]) => [
      name,
      withFileCacheReset(rule),
    ]),
  ),
};

export default plugin;
