//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import { PluginOptions as DocusaurusPluginOptions } from "docusaurus-plugin-typedoc";
import packageJson from "../package.json";

/**
 * Extract entry points to modules from package.json exports
 * */
const getEntryPoints = () => {
  const fs = require("fs");
  const path = require("path");
  const entries: string[] = [];

  for (const [key, value] of Object.entries(packageJson.exports)) {
    if (key === "." || key.includes(".css")) continue;

    if (typeof value === "object" && value !== null && "types" in value) {
      const typesPath = value.types as string;
      // Convert "./dist/X.d.ts" to "../src/X"
      const basePath = typesPath
        .replace("./dist/", "../src/")
        .replace(".d.ts", "");

      // Try different file patterns
      const patterns = [
        `${basePath}.tsx`, // Direct file like GroveProvider.tsx
        `${basePath}.ts`, // Direct file like forms.ts
        `${basePath}/index.tsx`, // Directory with index.tsx
        `${basePath}/index.ts`, // Directory with index.ts
      ];

      for (const pattern of patterns) {
        const fullPath = path.resolve(__dirname, pattern);
        if (fs.existsSync(fullPath)) {
          entries.push(pattern);
          break;
        }
      }
    }
  }
  return entries;
};

const docusaurusPluginOptions: DocusaurusPluginOptions = {
  // @ts-expect-error Entry points are not available in DocusaurusPluginOptions
  entryPoints: getEntryPoints(),
  entryPointStrategy: "resolve",
  tsconfig: "../tsconfig.json",
  out: "docs/api",
  sidebar: {
    autoConfiguration: true,
    pretty: true,
    typescript: false,
    deprecatedItemClassName: "",
  },
  fileExtension: ".mdx",
  router: "module",
  entryFileName: "_index",
  watch: process.env.TYPEDOC_WATCH === "true",
  useCodeBlocks: true,
  parametersFormat: "table",
  interfacePropertiesFormat: "table",
  classPropertiesFormat: "table",
  enumMembersFormat: "table",
  typeDeclarationFormat: "table",
  indexFormat: "table",
  excludePrivate: true,
  excludeProtected: true,
  excludeInternal: true,
  readme: "none",
  sort: "source-order",
  hideGroupHeadings: true,
  categorizeByGroup: false,
  pageTitleTemplates: {
    module: (file) => file.name.split("/").at(-1) ?? "",
    index: () => "API",
  },
};

const config: Config = {
  title: "Grove Design System",
  tagline:
    "Build Web applications with comprehensive components and utilities.",
  url: "https://schmiedmayerlab.github.io",
  baseUrl: "/grove-ts/docs/",
  organizationName: "SchmiedmayerLab",
  projectName: "grove-ts",
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          remarkPlugins: [],
          rehypePlugins: [],
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],
  // @ts-expect-error TypeDoc plugin options are not typed correctly
  plugins: [["docusaurus-plugin-typedoc", docusaurusPluginOptions]],
  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Grove Design System",
      items: [
        {
          to: "/docs/getting-started",
          label: "Docs",
          position: "left",
        },
        {
          to: "/api/GroveProvider",
          label: "API Reference",
          position: "left",
        },
        {
          href: "https://schmiedmayerlab.github.io/grove-ts/storybook/",
          label: "Storybook",
        },
        {
          href: "https://github.com/SchmiedmayerLab/grove-ts",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      links: [
        {
          title: "Resources",
          items: [
            {
              label: "Storybook",
              to: "https://schmiedmayerlab.github.io/grove-ts/storybook/",
            },
            {
              label: "API Reference",
              to: "/api/GroveProvider",
            },
          ],
        },
        {
          title: "Community",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/SchmiedmayerLab/grove-ts",
            },
            {
              label: "Grove",
              href: "https://github.com/SchmiedmayerLab/grove-ts",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Stanford University.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: { v4: true },
};

export default config;
