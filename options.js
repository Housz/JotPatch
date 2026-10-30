'use strict';
// Firefox exposes the promise-based `browser` namespace, Chromium exposes `chrome`.
// Every call used on this page returns a promise in both, so one handle suffices.
const api = globalThis.browser?.storage ? globalThis.browser : globalThis.chrome;
const originField = document.querySelector('#origin');
const button = document.querySelector('#grant');
const status = document.querySelector('#status');
const preferenceStatus = document.querySelector('#preference-status');
const prefKey = 'jotpatch:preferences:v1';
const conversationToggle = document.querySelector('#conversation-navigation');
const labToggle = document.querySelector('#navigation-lab');
const labStatus = document.querySelector('#lab-status');
const conversationStatus = document.querySelector('#conversation-status');
const colorStatus = document.querySelector('#color-status');
const transparencyStatus = document.querySelector('#transparency-status');
let preferenceWrite = Promise.resolve();
function updatePreferences(patch) {
  // Serialize rapidly toggled options so read/modify/write updates do not race.
  preferenceWrite = preferenceWrite.catch(() => undefined).then(async () => {
    const current = (await api.storage.local.get(prefKey))[prefKey] || {};
    await api.storage.local.set({[prefKey]: { ...current, ...patch }});
  });
  return preferenceWrite;
}
const modes = new Set(['always', 'alt', 'off']);
const helpReason = new URLSearchParams(location.search).get('help');
if (helpReason === 'restricted' || helpReason === 'failed') {
  document.querySelector('#activation-help').hidden = false;
  document.querySelector('#activation-help-detail').textContent = helpReason === 'restricted'
    ? '当前浏览器内部页面不允许注入扩展。'
    : '注入或消息发送失败。请检查 about:debugging 中的扩展错误信息。';
}
const providedOrigin = new URLSearchParams(location.search).get('origin');
if (providedOrigin) originField.value = providedOrigin;

api.storage.local.get(prefKey).then((stored) => {
  const setting = stored[prefKey]?.selectionTrigger;
  const mode = modes.has(setting) ? setting : 'always';
  document.querySelector(`input[name="selectionTrigger"][value="${mode}"]`).checked = true;
  conversationToggle.checked = stored[prefKey]?.conversationNavigation !== false;
  labToggle.checked = stored[prefKey]?.navigationLab === true;
  const colorMode = stored[prefKey]?.defaultNoteColorMode === 'random' ? 'random' : 'yellow';
  document.querySelector(`input[name="defaultNoteColorMode"][value="${colorMode}"]`).checked = true;
  const transparency = ['soft','light'].includes(stored[prefKey]?.uiTransparency)
    ? stored[prefKey].uiTransparency : 'clear';
  document.querySelector(`input[name="uiTransparency"][value="${transparency}"]`).checked = true;
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

labToggle.addEventListener('change', async () => {
  try {
    await updatePreferences({ navigationLab: labToggle.checked });
    labStatus.textContent = labToggle.checked ? 'Navigation Lab 已开启。' : 'Navigation Lab 已关闭。';
  } catch { labStatus.textContent = '保存失败，请重试。'; }
});

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
    const granted = await api.permissions.request({ origins: [pattern] });
    if (!granted) { status.textContent = '未授权，仍然可以手动打开插件。'; return; }
    const response = await api.runtime.sendMessage({ type: 'JP_REGISTER_SITE', origin });
    if (!response?.ok) throw Error(response?.error || '注册失败');
    status.textContent = `已授权 ${origin}，刷新该网页即可自动找回便签。`;
  } catch (error) { status.textContent = `配置失败：${error.message}`; }
  finally { button.disabled = false; }
});

for (const radio of document.querySelectorAll('input[name="defaultNoteColorMode"]')) {
  radio.addEventListener('change', async () => {
    if (!radio.checked) return;
    try {
      await updatePreferences({ defaultNoteColorMode: radio.value });
      colorStatus.textContent = '已保存，新的便签会按此颜色创建。';
    } catch {
      colorStatus.textContent = '保存失败，请重试。';
    }
  });
}

for (const radio of document.querySelectorAll('input[name="uiTransparency"]')) {
  radio.addEventListener('change', async () => {
    if (!radio.checked) return;
    try {
      await updatePreferences({uiTransparency: radio.value});
      transparencyStatus.textContent = '已保存，已打开的网页立即生效。';
    } catch { transparencyStatus.textContent = '保存失败，请重试。'; }
  });
}
