// Content stays visible until an actual animation starts; script failure is harmless.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
if (!reducedMotion.matches && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (reducedMotion.matches) continue;
        entry.target.classList.add("arrive");
      }
    },
    { threshold: 0.12 },
  );
  document
    .querySelectorAll(
      ".cover-intro > *, .browse-tools h2, .results-heading, .spots li, .reading-note h2, .reading-note p, .information-types > div, .footer-copy > p",
    )
    .forEach((element) => observer.observe(element));
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
      observer.disconnect();
      document.getAnimations().forEach((animation) => animation.cancel());
    }
  });
}
