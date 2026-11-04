"use client";

import { useEffect } from "react";

export default function InitialLoader() {
  useEffect(() => {
    const loader = document.getElementById("initial-loader");

    if (loader) {
      loader.classList.add("initial-loader-hidden");

      setTimeout(() => {
        loader.style.display = "none";
      }, 500);
    }
  }, []);

  return null;
}