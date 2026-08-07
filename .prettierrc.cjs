//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

const config = {
  semi: false,
  singleQuote: true,
  experimentalTernaries: true,
  plugins: ['prettier-plugin-tailwindcss'],
  overrides: [
    {
      files: ['packages/design-system/**/*.{js,jsx,ts,tsx}'],
      options: {
        semi: true,
        singleQuote: false,
      },
    },
  ],
}

module.exports = config
