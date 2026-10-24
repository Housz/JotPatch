// Options page: grant optional per-site access so notes restore automatically.
// Compiled to dist/options.js; the page itself only requests the permission and
// then registers that one site script through the shared helper.
namespace JP {
  const originField = document.querySelector<HTMLInputElement>('#origin');
  const button = document.querySelector<HTMLButtonElement>('#grant');
  const status = document.querySelector<HTMLElement>('#status');
  if (!originField || !button || !status) throw new Error('JotPatch options page markup is incomplete');

  const providedOrigin = new URLSearchParams(location.search).get('origin');
  if (providedOrigin) originField.value = providedOrigin;

  button.addEventListener('click', async () => {
    let origin: string;
    let pattern: string;
    try {
      const url = new URL(originField.value.trim());
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('invalid URL');
      origin = url.origin;
      pattern = buildMatchPattern(origin);
    } catch {
      status.textContent = '请输入有效的 https:// 或 http:// 网站地址。';
      return;
    }
    // The permission prompt must be requested inside the click gesture, so no
    // await may run before permissions.request().
    button.disabled = true;
    status.textContent = '正在请求网站权限…';
    try {
      const granted = await JP.api.permissions.request({ origins: [pattern] });
      if (!granted) {
        status.textContent = '未授权。你仍可通过扩展图标手动使用。';
        return;
      }
      const result = await syncSiteScripts();
      if (result.registered.length || result.removed.length) {
        console.info('JotPatch site sync', result);
      }
      status.textContent = `已授权 ${origin}。返回网页并刷新，即可自动恢复该页便签。`;
    } catch (error) {
      status.textContent = `配置失败：${(error as Error).message}`;
    } finally {
      button.disabled = false;
    }
  });
}
