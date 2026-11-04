"use client";

import { useEffect } from "react";

/**
 * Locks the page behind a popup/modal. `position: fixed` on <body> is the only
 * approach that reliably stops iOS/Android from scrolling the background.
 * The previous scroll position and styles are restored when the popup closes.
 */
export function useLockBodyScroll(active = true) {
  useEffect(() => {
    if (!active) return undefined;

    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;

    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}