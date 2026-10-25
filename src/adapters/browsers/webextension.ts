namespace JP {
  /** Minimal WebExtension runtime gateway. No browser-specific code in core. */
  export function extensionApi(): typeof chrome {
    const environment = globalThis as unknown as { chrome?: typeof chrome; browser?: typeof chrome };
    const api = environment.browser?.runtime && environment.browser?.storage
      ? environment.browser : environment.chrome;
    if (!api?.runtime || !api?.storage) throw new Error('JotPatch requires a WebExtension runtime');
    return api;
  }
}
