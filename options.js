'use strict';
const originField = document.querySelector('#origin');
const button = document.querySelector('#grant');
const status = document.querySelector('#status');
const preferenceStatus = document.querySelector('#preference-status');
const prefKey = 'jotpatch:preferences:v1';
const conversationToggle = document.querySelector('#conversation-navigation');
const conversationStatus = document.querySelector('#conversation-status');
let preferenceWrite = Promise.resolve();
function updatePreferences(patch) {
  // Serialize rapidly toggled options so read/modify/write updates do not race.
  preferenceWrite = preferenceWrite.catch(() => undefined).then(async () => {
    const current = (await chrome.storage.local.get(prefKey))[prefKey] || {};
    await chrome.storage.local.set({[prefKey]: { ...current, ...patch }});
  });
  return preferenceWrite;
}
const modes = new Set(['always', 'alt', 'off']);
const providedOrigin = new URLSearchParams(location.search).get('origin');
if (providedOrigin) originField.value = providedOrigin;

chrome.storage.local.get(prefKey).then((stored) => {
  const setting = stored[prefKey]?.selectionTrigger;
  const mode = modes.has(setting) ? setting : 'always';
  document.querySelector(`input[name="selectionTrigger"][value="${mode}"]`).checked = true;
  conversationToggle.checked = stored[prefKey]?.conversationNavigation !== false;
});
for (const radio of document.querySelectorAll('input[name="selectionTrigger"]')) {
  radio.addEventListener('change', async () => {
    if (!radio.checked) return;
    try {
      await updatePreferences({ selectionTrigger: radio.value });
      preferenceStatus.textContent = '已保存，现有网页立即生效。';
    } catch {
      preferenceStatus.textContent = '保存失败，请重试。';
    }
  });
}

conversationToggle.addEventListener('change', async () => {
  try {
    await updatePreferences({ conversationNavigation: conversationToggle.checked });
    conversationStatus.textContent = '已保存，已打开的网页会同步更新。';
  } catch { conversationStatus.textContent = '保存失败，请重试。'; }
});

button.addEventListener('click', async () => {
  let origin;
  try {
    const url = new URL(originField.value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw Error('invalid URL');
    origin = url.origin;
  } catch { status.textContent = '请输入有效的 HTTP(S) 网站地址。'; return; }
  button.disabled = true;
  status.textContent = '正在请求网站权限…';
  try {
    const url = new URL(origin);
    const pattern = `${url.protocol}//${url.hostname}/*`;
    // The browser permission prompt must be called during the user gesture.
    const granted = await chrome.permissions.request({ origins: [pattern] });
    if (!granted) { status.textContent = '未授权，仍然可以手动打开插件。'; return; }
    const response = await chrome.runtime.sendMessage({ type: 'JP_REGISTER_SITE', origin });
    if (!response?.ok) throw Error(response?.error || '注册失败');
    status.textContent = `已授权 ${origin}，刷新该网页即可自动找回便签。`;
  } catch (error) { status.textContent = `配置失败：${error.message}`; }
  finally { button.disabled = false; }
});
