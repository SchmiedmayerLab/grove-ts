//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

const {
  getEslintReactConfig,
} = require("@schmiedmayerlab/grove-configurations");
const jsdoc = require("eslint-plugin-jsdoc");

module.exports = [
  { ignores: ["storybook-static"] },
  ...getEslintReactConfig({ tsconfigRootDir: __dirname }),
  {
    files: ["**/*.{js,ts,tsx}"],
    plugins: {
      jsdoc,
    },
    rules: {
      "jsdoc/no-multi-asterisks": "error",
    },
  },
];
