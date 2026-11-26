//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import "@testing-library/jest-dom/vitest";
import { toast } from "sonner";

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

// jsdom doesn't implement scrollIntoView; stub it for components that rely on it (e.g., Command)
if (!("scrollIntoView" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
}

// Sonner keeps toasts in a module-level store and shows earlier ones once a Toaster mounts.
// Dismiss them after each test, so toasts from one test do not appear in the next.
afterEach(() => {
  toast.dismiss();
});
