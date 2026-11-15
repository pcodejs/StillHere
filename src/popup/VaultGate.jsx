import UpdateNotice from './UpdateNotice.jsx';
import React, {useEffect, useState} from 'react';
import {Alert, Button, Checkbox, Loader, PasswordInput, SegmentedControl, Stack, Text, Title} from '@mantine/core';
import {translate} from './i18n.js';

const errorKeys = {
  PASSWORD_LENGTH: 'vaultPasswordLength',
  PASSWORD_INVALID: 'vaultPasswordInvalid',
  PASSWORD_EXISTS: 'vaultPasswordExists',
  PASSWORD_REQUIRED: 'vaultPasswordRequired',
  LEGACY_KEY_MISSING: 'vaultRecoveryCopy',
  VAULT_SETUP_FAILED: 'vaultSetupError',
  STORAGE_ERROR: 'vaultStorageError',
};

async function request(type, values = {}) {
  const result = await chrome.runtime.sendMessage({type, ...values});
  if (!result || result.error) {
    const error = Error(result?.error || 'Unavailable');
    error.code = result?.code;
    throw error;
  }
  return result;
}

export default function VaultGate({children, enabled = true}) {
  const [status, setStatus] = useState(null);
  const [language, setLanguage] = useState('vi');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [preserveLegacy, setPreserveLegacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const t = key => translate(language, key);
  const needsRecovery = !status?.configured && status?.legacyIssue === 'missing-key';

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    request('LANGUAGE_READ').then(value => {
      if (active) setLanguage(value.language);
    }).catch(() => {});
    const changed = (changes, area) => {
      if (active && area === 'local' && changes.uiPreferences) {
        setLanguage(changes.uiPreferences.newValue?.language === 'en' ? 'en' : 'vi');
      }
    };
    chrome.storage.onChanged.addListener(changed);
    let refreshing = false;
    const refresh = () => {
      if (refreshing) return;
      refreshing = true;
      return request('VAULT_STATUS').then(value => {
        if (active) {
          setStatus(value);
          setErrorKey(previous => previous === 'vaultStatusError' ? '' : previous);
        }
      }).catch(() => {
        if (active) setErrorKey('vaultStatusError');
      }).finally(() => {refreshing = false;});
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      active = false;
      clearInterval(timer);
      chrome.storage.onChanged.removeListener(changed);
    };
  }, [enabled]);

  useEffect(() => {
    setSlow(false);
    if (!busy) return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [busy]);

  useEffect(() => {
    if (enabled) document.documentElement.lang = language;
  }, [language, enabled]);

  async function changeLanguage(value) {
    setLanguage(value);
    try {await request('LANGUAGE_WRITE', {language: value});}
    catch {setErrorKey('vaultStorageError');}
  }

  async function submit(event) {
    event.preventDefault();
    if (!status || busy) return;
    setErrorKey('');
    if (!status?.configured && password !== confirm) {
      setErrorKey('vaultMismatch');
      return;
    }
    if (needsRecovery && !preserveLegacy) return;
    setBusy(true);
    try {
      setStatus(await request(status?.configured ? 'VAULT_UNLOCK' : 'VAULT_SETUP', {
        password, preserveUnreadableLegacy: preserveLegacy,
      }));
      setPassword('');
      setConfirm('');
    } catch (failure) {
      setErrorKey(errorKeys[failure.code] || 'vaultStatusError');
      const next = await request('VAULT_STATUS').catch(() => status);
      setStatus(failure.code === 'LEGACY_KEY_MISSING' ? {...next, legacyIssue: 'missing-key'} : next);
    } finally {
      setBusy(false);
    }
  }

  if (!enabled || status?.unlocked) return children;

  const brandHeader = <div className="vault-top">
    <img className="vault-brand" src="assets/stillhere-logo-transparent.png" alt="StillHere – Unsend Message Viewer" width="1960" height="532" />
    <SegmentedControl id="vault-language" aria-label="Language / Ngôn ngữ" size="xs" value={language}
      onChange={changeLanguage} data={[{label: 'VI', value: 'vi'}, {label: 'EN', value: 'en'}]} />
  </div>;

  if (!status) return <main className="vault-shell">
    <section className="vault-panel vault-loading-panel">
      {brandHeader}<UpdateNotice language={language}/>
      <div id="vault-loading" className="vault-loading" role="status" aria-live="polite">
        <Loader size="sm" aria-hidden="true" /><Text>{t('vaultLoading')}</Text>
      </div>
      {errorKey && !['vaultPasswordInvalid', 'vaultPasswordLength', 'vaultMismatch'].includes(errorKey) && <Alert color="red" role="alert">{t(errorKey)}</Alert>}
    </section>
  </main>;

  return <main className="vault-shell">
    <section className="vault-panel">
      {brandHeader}<UpdateNotice language={language}/>
      <div className="vault-layout">
        <div className="vault-welcome">
          <Title order={2}>{t(status.configured ? 'vaultUnlockTitle' : 'vaultCreateTitle')}</Title>
          <Text>{t(status.configured ? 'vaultUnlockCopy' : 'vaultCreateCopy')}</Text>
        </div>
        <form className="vault-form" onSubmit={submit}>
          <Stack>
            {needsRecovery && <Alert id="legacy-recovery-notice" color="yellow" title={t('vaultRecoveryTitle')}>
              <Text size="sm">{t('vaultRecoveryCopy')}</Text>
              <Checkbox id="preserve-legacy" mt="sm" checked={preserveLegacy} onChange={event => setPreserveLegacy(event.currentTarget.checked)} label={t('vaultPreserve')} />
            </Alert>}
            <PasswordInput id="vault-password" label={t('vaultPassword')} value={password}
              aria-invalid={['vaultPasswordInvalid', 'vaultPasswordLength'].includes(errorKey) || undefined}
              description={!status.configured ? t('vaultPasswordHint') : undefined}
              error={['vaultPasswordInvalid', 'vaultPasswordLength'].includes(errorKey) ? <span role="alert">{t(errorKey)}</span> : undefined}
              onChange={event => setPassword(event.currentTarget.value)} minLength={6} maxLength={256} required
              visibilityToggleButtonProps={{'aria-label': language === 'en' ? 'Show or hide password' : 'Hiện hoặc ẩn mật khẩu'}}
              autoComplete={status.configured ? 'current-password' : 'new-password'} />
            {!status.configured && <PasswordInput id="vault-confirm" label={t('vaultConfirm')} value={confirm}
              aria-invalid={errorKey === 'vaultMismatch' || undefined}
              error={errorKey === 'vaultMismatch' ? <span role="alert">{t(errorKey)}</span> : undefined}
              onChange={event => setConfirm(event.currentTarget.value)} required autoComplete="new-password"
              visibilityToggleButtonProps={{'aria-label': language === 'en' ? 'Show or hide confirmation' : 'Hiện hoặc ẩn mật khẩu nhập lại'}} />}
            {errorKey && !['vaultPasswordInvalid', 'vaultPasswordLength', 'vaultMismatch'].includes(errorKey) && <Alert color="red" role="alert">{t(errorKey)}</Alert>}
            <Button id="vault-submit" type="submit" loading={busy} disabled={needsRecovery && !preserveLegacy}>
              {t(status.configured ? 'vaultContinue' : 'vaultCreate')}
            </Button>
            {busy && <Text id="vault-progress" size="sm" role="status" aria-live="polite">
              {t(slow ? 'vaultWorkingSlow' : 'vaultWorking')}
            </Text>}
          </Stack>
        </form>
        <Stack id="vault-security-copy">
          <Text>{t('vaultSession')}</Text>
          {status.configured && <Alert color={status.capture?.capacityReached || status.capture?.accountBlocked ? 'orange' : 'blue'} role="status">
            {t(!status.capture?.ready ? 'captureUnlockRequired' : status.capture.capacityReached ? 'captureFull' : status.capture.accountBlocked ? 'captureAccountBlocked' : status.capture.enabled ? 'captureLockedReady' : 'captureDisabledLocked')}
          </Alert>}
        </Stack>
      </div>
    </section>
  </main>;
}
