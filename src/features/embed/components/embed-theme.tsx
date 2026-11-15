"use client";

import { useEffect } from "react";
import type { EmbedTheme } from "@/features/embed/schema";

// Makes the widget follow the OWNER's chosen theme (EMBED-04) instead of the visitor's
// light/dark setting. The page already carries the "dark" class on its own wrapper, so a
// dark widget is right from the first paint; this component sets the same class on <html>
// (which the colour variables and the dark: styles read) and keeps it there, because the
// site-wide theme switcher sets it from the visitor's setting after the page loads.
// It writes nothing to storage, so it cannot change the visitor's own choice on the main site.
export function EmbedTheme({ theme }: { theme: EmbedTheme }) {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === "dark";
      if (root.classList.contains("dark") !== dark) root.classList.toggle("dark", dark);
      if (root.style.colorScheme !== theme) root.style.colorScheme = theme;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
  }, [theme]);
  return null;
}
