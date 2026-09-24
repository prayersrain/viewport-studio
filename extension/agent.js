// Runs in the page's own world (MAIN) so page scripts see the phone user agent that
// Studio sends to the server. Studio passes the choice in the iframe name
// ("viewport-…|iphone"); every page outside a Studio device is left alone.
// Keep the strings in step with userAgent() in core.js (a unit test compares them).
(() => {
  const agent = /^viewport-[\w-]+\|(iphone|android)$/.exec(window.name)?.[1];
  const parents = location.ancestorOrigins;
  if (!agent || parents?.length !== 1 || !parents[0].startsWith('chrome-extension://')) return;
  const major = /Chrome\/(\d+)/.exec(navigator.userAgent)?.[1] ?? '140';
  const profile = agent === 'iphone'
    ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', vendor: 'Apple Computer, Inc.' }
    : { userAgent: `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`, platform: 'Linux armv81', vendor: 'Google Inc.' };
  const original = navigator.userAgentData;
  // Safari has no userAgentData; Chrome on Android reports a mobile Android device.
  const data = agent === 'iphone' || !original ? undefined : {
    brands: original.brands, mobile: true, platform: 'Android',
    getHighEntropyValues: async hints => ({ ...(await original.getHighEntropyValues(hints)), mobile: true, platform: 'Android', platformVersion: '10.0.0', model: 'K', architecture: '', bitness: '' }),
    toJSON() { return { brands: this.brands, mobile: true, platform: 'Android' }; },
  };
  const define = (name, value) => Object.defineProperty(Navigator.prototype, name, { get: () => value, configurable: true, enumerable: true });
  define('userAgent', profile.userAgent);
  define('appVersion', profile.userAgent.slice('Mozilla/'.length));
  define('platform', profile.platform);
  define('vendor', profile.vendor);
  define('userAgentData', data);
})();
