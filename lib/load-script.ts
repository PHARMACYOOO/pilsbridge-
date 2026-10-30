const scripts = new Map<string, Promise<void>>();

/** Load a third-party script once (Google, Apple, Flutterwave). A failed load can be retried. */
export function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scripts.delete(src);
        s.remove();
        reject(new Error(`Couldn’t load ${src}`));
      };
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}
