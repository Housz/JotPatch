'use strict';
const originField = document.querySelector('#origin');
const button = document.querySelector('#grant');
const status = document.querySelector('#status');
const providedOrigin = new URLSearchParams(location.search).get('origin');
if (providedOrigin) originField.value = providedOrigin;

button.addEventListener('click', async () => {
  let origin;
  try {
    const url = new URL(originField.value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw Error('invalid URL');
    origin = url.origin;
  } catch {
    status.textContent = '请输入有效的 https:// 或 http:// 网站地址。';
    return;
  }
  // Call request directly inside the button user gesture, without awaiting first.
  button.disabled = true;
  status.textContent = '正在请求网站权限…';
  try {
    // Chrome match patterns do not encode URL ports (localhost:8000 -> localhost/*).
    const url = new URL(origin);
    const pattern = `${url.protocol}//${url.hostname}/*`;
    const granted = await chrome.permissions.request({ origins: [pattern] });
    if (!granted) { status.textContent = '未授权。你仍可通过扩展图标手动使用。'; return; }
    const registered = await chrome.runtime.sendMessage({ type: 'JP_REGISTER_SITE', origin });
    if (!registered?.ok) throw Error(registered?.error || '脚本注册失败');
    status.textContent = `已授权 ${origin}。返回网页并刷新，即可自动恢复该页便签。`;
  } catch (error) {
    status.textContent = `配置失败：${error.message}`;
  } finally { button.disabled = false; }
});
