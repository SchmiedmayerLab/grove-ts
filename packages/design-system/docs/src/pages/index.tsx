//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

"use client";

import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import Layout from "@theme/Layout";
import {
  Accessibility,
  ArrowRight,
  Blocks,
  BookOpen,
  CheckCircle2,
  Code2,
  GitFork,
  MoonStar,
  Palette,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import styles from "./index.module.css";

const features = [
  {
    icon: Blocks,
    title: "Reusable interface patterns",
    description:
      "Compose forms, navigation, tables, dialogs, application layouts, and utilities from one maintained package.",
  },
  {
    icon: Accessibility,
    title: "Accessible foundations",
    description:
      "Build on keyboard-aware, screen-reader-friendly primitives with consistent focus and interaction patterns.",
  },
  {
    icon: MoonStar,
    title: "Adaptive themes",
    description:
      "Use built-in light and dark themes, follow system preferences, or provide custom design tokens.",
  },
  {
    icon: Code2,
    title: "Type-safe APIs",
    description:
      "Develop with strict TypeScript contracts and modern React patterns that make integrations easier to maintain.",
  },
  {
    icon: Palette,
    title: "Flexible styling",
    description:
      "Start with opinionated defaults and adapt them through Tailwind CSS, semantic tokens, and class overrides.",
  },
  {
    icon: ShieldCheck,
    title: "Production confidence",
    description:
      "Rely on automated tests, coverage gates, package validation, and continuous security checks.",
  },
] as const;

export const Landing = () => {
  const lightShowcase = useBaseUrl("/img/grove-showcase-light.png");
  const darkShowcase = useBaseUrl("/img/grove-showcase-dark.png");

  return (
    <Layout
      title="Grove Design System"
      description="Reusable, accessible, and themeable React components for digital health and research interfaces."
    >
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroContainer}>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <div className={styles.eyebrow}>
                  <Sparkles aria-hidden="true" />
                  Grove Design System
                </div>
                <h1 className={styles.title}>
                  Build thoughtful research interfaces faster.
                </h1>
                <p className={styles.description}>
                  Grove provides reusable, accessible, and themeable React
                  components for custom digital health and research
                  applications.
                </p>
                <div className={styles.buttons}>
                  <Link
                    className={styles.primaryButton}
                    to="/docs/getting-started"
                  >
                    <BookOpen aria-hidden="true" />
                    Get started
                  </Link>
                  <Link
                    className={styles.secondaryButton}
                    href="https://schmiedmayerlab.github.io/grove-ts/storybook/"
                  >
                    Explore Storybook
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
                <ul className={styles.heroHighlights}>
                  <li>
                    <CheckCircle2 aria-hidden="true" /> React 19
                  </li>
                  <li>
                    <CheckCircle2 aria-hidden="true" /> TypeScript
                  </li>
                  <li>
                    <CheckCircle2 aria-hidden="true" /> Tailwind CSS
                  </li>
                </ul>
              </div>

              <figure className={styles.showcase}>
                <Link
                  href="https://schmiedmayerlab.github.io/grove-ts/storybook/?path=/story/examples-grove-showcase--light"
                  aria-label="Open the Grove research interface example in Storybook"
                >
                  <img
                    className={styles.showcaseLight}
                    src={lightShowcase}
                    alt="A digital health research interface built with the Grove design system in light mode"
                  />
                  <img
                    className={styles.showcaseDark}
                    src={darkShowcase}
                    alt="A digital health research interface built with the Grove design system in dark mode"
                  />
                </Link>
                <figcaption>
                  An example research interface assembled from Grove components.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className={styles.features}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>Designed to work together</p>
              <h2>Strong foundations without a rigid template</h2>
              <p>
                Adopt individual components or use Grove as the interface
                foundation for an entire application.
              </p>
            </div>
            <div className={styles.featureGrid}>
              {features.map(({ icon: Icon, title, description }) => (
                <article className={styles.featureCard} key={title}>
                  <div className={styles.featureIcon}>
                    <Icon aria-hidden="true" />
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.quickStart}>
          <div className={styles.container}>
            <div className={styles.quickStartGrid}>
              <div>
                <p className={styles.sectionEyebrow}>Start with one package</p>
                <h2>From installation to an adaptive interface</h2>
                <p className={styles.quickStartDescription}>
                  Install the design system, wrap your application once, and let
                  Grove follow the browser or operating-system appearance.
                </p>
                <Link className={styles.textLink} to="/docs/getting-started">
                  Read the installation guide
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
              <div className={styles.codeCard}>
                <div className={styles.codeHeader}>
                  <span />
                  <span />
                  <span />
                  <strong>Quick start</strong>
                </div>
                <pre>
                  <code>{`npm install @schmiedmayerlab/grove-design-system

<GroveProvider
  router={routerProps}
  colorScheme="system"
>
  <App />
</GroveProvider>`}</code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.callToAction}>
          <div className={styles.callToActionContent}>
            <h2>Explore the complete component library</h2>
            <p>
              Browse live examples, component states, and usage guidance in
              Storybook.
            </p>
            <div className={styles.buttons}>
              <Link
                className={styles.lightButton}
                href="https://schmiedmayerlab.github.io/grove-ts/storybook/"
              >
                Open Storybook
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link
                className={styles.darkButton}
                href="https://github.com/SchmiedmayerLab/grove-ts"
              >
                <GitFork aria-hidden="true" />
                View on GitHub
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
};

export default Landing;
